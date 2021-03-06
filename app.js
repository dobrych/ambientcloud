// global vars
var venuesCounter = 0;
var venuesTotal = 0;
var curVenue = undefined;
// soundcloud
var playerUrl = 'http://w.soundcloud.com/player/?url=';
var appId = '1ee9fe851a6580a3e57bfe90a82912f3';
// foursquare
var fsAppId = 'DWLBUCKYKPV2SRXZE30OA1PFWFTMRA0JVCHIFKRD2YU5FQ4H';
var fsAppSec = 'C22UY5CFBAACKKWK1G5DJIVKDYPYEQVSD4FFJ2SEYTUNJ5DL';
// instagram
var instaUrl = 'https://api.instagram.com/v1/media/search?client_id=1506e49fc0e94167bd42f681341a2b46&';
// default geo data
var lat = geoip_latitude();
var lon = geoip_longitude();
// models
var Venue = Backbone.Model.extend({
    localStorage: new Store("sndVenues"),
    render: function() { // renders data into DOM
        var l = this.get('location');
        var addr = l.address ? l.address : l.city;
        // static google map picture url
        var gmapsPic = 'http://maps.googleapis.com/maps/api/staticmap?zoom=14&maptype=roadmap&sensor=false&size='+$('#tracksWrapper').width()+'x80&center='+l.lat+','+l.lng+'&markers=color:red|color:red|'+l.lat+','+l.lng;
        // html generation
        $('<div class="venue" id="'+this.get('id')+'"></div>')
            .append('<h3>“'+this.get('name')+'” <small>'+addr+'</small></h3>')
            .append('<p><img src="' + gmapsPic + '" alt="map"></p>')
            .append('<ul class="unstyled"></ul>')
            .appendTo('#tracksWrapper');
        // render each track of this venue
        _.each(this.get('tracks'), function(t) { Tracks.get(t).render(); });
        this.getInstagrams(); // pre-fetch istagrams urls
    },
    getInstagrams: function() { // fetches instagrams and stores urls of images in local cache
        var l = this.get('location');
        var v = this; // for use in callback
        var venueInstagramsUrl = instaUrl + 'foursquare_v2_id=' + v.id + '&lat=' + l.lat + '&lng=' + l.lng + '&callback=?';
        $.getJSON(venueInstagramsUrl, function(data) {
            // digging images urls from json API data with pluck
            var images = _.pluck(data.data, 'images');
            images = _.pluck(images, 'low_resolution');
            v.set({ instagrams: _.pluck(images, 'url') });
            v.save();
        });
    }
});
var BadVenue = Backbone.Model.extend({ localStorage: new Store("sndBadVenues") });
var Track = Backbone.Model.extend({
    localStorage: new Store("sndTracks"),
    render: function() {
        $('#' + this.get('venue_id') + ' ul').append('<li><i class="icon-play"></i> <a class="playit" data-track="'+this.get('id')+'" href="#track:'+this.get('id')+'">'+this.get('title')+'</a></li>');
    }
});
// collections
var VenuesCollection = Backbone.Collection.extend({
    model: Venue,
    localStorage: new Store("sndVenues")
});
var BadVenuesCollection = Backbone.Collection.extend({
    model: BadVenue,
    localStorage: new Store("sndBadVenues")
});
var TracksCollection = Backbone.Collection.extend({
    model: Track,
    localStorage: new Store("sndTracks")
});
// set collections objects
var Venues = new VenuesCollection;
var BadVenues = new BadVenuesCollection;
var Tracks = new TracksCollection;
// fill collections from local storage
Venues.fetch();
BadVenues.fetch();
Tracks.fetch();
// generates iframe src for player
function loadTrack(trckId) {
    $('#player').attr('src', playerUrl + 'http://api.soundcloud.com/tracks/' + trckId + '?auto_play=true');
    setInstaSlides(trckId);
};
// loads first track into player without autoplay, calls instagrams renderer
function selectFirstTrack() {
    var trckId = $('.playit').eq(0).attr('data-track');
    $('#player').attr('src', playerUrl + 'http://api.soundcloud.com/tracks/' + trckId);
    setInstaSlides(trckId);
};
// instagrams renderer
function setInstaSlides(trckId) {
    var trckVenue = Tracks.get(trckId).get('venue_id');
    if (curVenue == trckVenue) // update instagrams slides only if venue changed
        return true;
    $('#instagrams').empty();
    var imgsHtml = ''; // build html images list
    _.each(Venues.get(trckVenue).get('instagrams').sort(function() { return 0.5 - Math.random(); }), function(i) {
        imgsHtml += '<img src="' + i +'" alt="">';
    });
    // render slides
    $('#instagrams').append(imgsHtml).cycle({ fx: 'scrollHorz', timeout: 5000 });
    curVenue = trckVenue;
};
// gets location param from GET url
function getLocFromUrl() {
    var regex = new RegExp("[\\?&]l=([^&#]*)");
    var results = regex.exec(window.location.search);
    if(results == null)
        return "";
    else
        return decodeURIComponent(results[1].replace(/\+/g, " "));
};
// updates progress bar while API requests
function updateProgress() {
    venuesCounter--;
    var pcnt = 100 - ((100 / venuesTotal) * venuesCounter);
    $('#fetchingProgress').width(pcnt + '%');
    if (pcnt == 100) { // if load finished
        $('#fetchingProgress').parent().fadeOut();
        selectFirstTrack();
    }
};
// processes venues (fetches and starts check for soundcloud tracks)
function processVenues(lat, lon) {
    $.getJSON('https://api.foursquare.com/v2/venues/search?ll='+lat+','+lon+'&radius=5000&limit=50&client_id='+fsAppId+'&client_secret='+fsAppSec+'&v=20120325&callback=?',
        function(data) {
            venuesCounter = venuesTotal = data.response.venues.length; // counter used for progress bar
            $('#fetchingProgress').width('0%').parent().show();
            console.log('got ' + data.response.venues.length + ' venues, fetching tracks for each');
            _.each(data.response.venues, function(v) { setTimeout(fetchTracksForVenue, 500, v); });
        }
    );
};
// fetches all tracks for single venue from Soundcloud
function fetchTracksForVenue(v) {
    // check if venue is already in cache
    if (Venues.get(v.id)) {
        updateProgress();
        Venues.get(v.id).render();
        return true; // venue already in cache
    } else if (BadVenues.get(v.id)) {
        updateProgress();
        return true; // venue already in cache
    }
    $.getJSON('https://api.soundcloud.com/tracks.json?tags=foursquare:venue='+v.id+'&client_id='+appId+'&callback=?',
        function(data) {
            updateProgress();
            if (data.length == 0) {
                // cache venue without tracks, don't render
                var bv = new BadVenue({ id: v.id });
                bv.save();
                BadVenues.add(bv);
                return false;
            }
            // cache venue and tracks
            var venue = new Venue({ id: v.id, name: v.name, location: v.location, has_track: true, tracks: [] });
            _.each(data, function(t) {
                var track = new Track({id: t.id, title: t.title, pic: t.artwork_url, venue_id: v.id});
                track.save();
                venue.attributes.tracks.push(t.id);
                Tracks.add(track);
            });
            venue.save();
            console.log('rendering new venue ' + v.id);
            Venues.add(venue);
            venue.render();
        }
    );
};
// geocode search string into geo coordinates using Google maps
function geocodeToLLRender(loc, cb) {
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: loc }, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            lat = results[0].geometry.location.lat();
            lon = results[0].geometry.location.lng();
            console.log('Got geo results: ' + lat + ', ' + lon);
            $('#fieldblock').addClass('success');
            $('#tracksWrapper').empty();
            cb(lat, lon);
        } else
            $('#fieldblock').addClass('error');
    });
};
// init
$(document).ready(function() {
    var location = getLocFromUrl();
    if (location)
        geocodeToLLRender(location, processVenues); // processVenues is callback
    else
        processVenues(lat, lon); // default from geo ip
    // default placeholder in search form
    $('#search-geo-data').val(location ? location : geoip_city() + ', ' + geoip_country_name());
    // play track on click
    $('.playit').live('click', function() { loadTrack($(this).attr('data-track')); return false; });
    // cleanup from past search results
    $('#search-geo').focus(function() { $('#search-geo-data').removeClass('error').removeClass('success'); });
});