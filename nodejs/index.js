var express = require('express');
var webtorrent = require('webtorrent');
var path = require('path');
var http = require('http');
var app = express();
var bodyParser = require("body-parser");
var fs = require('fs');
var Transcoder = require ('stream-transcoder');
var port = 3000;

var client = new webtorrent();
var quality = 'high';

var listOfTorrents = {};
var CurrentTranscodings = {};
app.use(function(request, response, next) {
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE');
    response.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


var getLargestFile = function(torrent) {
    var file;
    for (var i = 0; i< torrent.files.length; i++ ) {
        if( !file || file.length < torrent.files[i].length) {
            file = torrent.files[i];
        }
    }
    return file;
};


//var io = require('socket.io').listen(server);
//console.log('Socket opened on http://127.0.0.1:' );

var torrentID;
app.post('/streamtorrent/add', function(request, response, next) {
    try {

        if(!request.body.torrent || !request.body.id ){
            response.status(500).send('Missing torrent info in request!'); return;
        }
        var id = request.body.id;
        if(listOfTorrents.id !== undefined) {
            console.log("torrent not added, because it seems to already exist");
            response.status(200).send("torrent already exists, skipping..."); return;
        }
        torrentID = fs.readFileSync(request.body.torrent);
        client.add(torrentID, function(torrent){
            var file = getLargestFile(torrent);
            torrent.swarm.on('upload', function() {
                if(torrent.length == torrent.downloaded) {
                    torrent.swarm.destroy();
                    torrent.discovery.stop();
                    delete listOfTorrents.id;
                }

            });
            var id = request.body.id;
            listOfTorrents.id =  request.body.torrent;
            response.status(200).send('Added torrent!');
        });
       console.log("Torrent added");
    }
    catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log("adding torrent failed");
    }
});

app.get('/streamtorrent/:id.mp4', function(request, response){
    try {
        var id = request.params.id;
        var path = listOfTorrents.id;
        var torrent = client.get(fs.readFileSync(listOfTorrents.id));
        var file = getLargestFile(torrent);
        var total = file.length;
        var extension = file.name.split('.').pop();


        if(typeof request.headers.range != 'undefined') {
            var range = request.headers.range;
            var parts = range.replace(/bytes=/, "").split("-");
            var partialstart = parts[0];
            var partialend = parts[1];
            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : total - 1;
            var chunksize = (end - start) + 1;
        } else {
            var start = 0; var end = total;
        }

        var stream = file.createReadStream({start: start, end: end});

        if(extension != "mp4") {
            var stream = file.createReadStream();
            var ExecConfig = "";
            var output = '/var/www/rufy/nodejs/assets/transcoded_' + file.name;
            var input = file.createReadStream({start:start, end: end});
            var trans = new Transcoder(stream)
                .videoCodec('h264')
                .format('mp4')
                .custom('strict', 'experimental')
                .on('finish', function(){
                    console.log('finished transcoding');
                })
                .on('error', function(err){
                    console.log('transcoding error: %o', err);
                });
            response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
            trans.stream().pipe(response);
            //var stream = fs.createReadStream(output, {start:start});
        }
        else {
            var stream = file.createReadStream({start: start, end: end});
            response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
            stream.pipe(response);
        }

    } catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log('getting stream failed' + err.toString());
    }
});

app.get('/delete/:id', function(request, response){
    console.log(listOfTorrents);
    if(request.params.id =='undefined' || request.params.id == ''){
        response.status(500).send('Missing torrent ID in your request'); return;
    }
    try {
        var id = request.params.id;
        var torrent = client.remove(fs.readFileSync(listOfTorrents.id));
        console.log('Removed torrent' + listOfTorrents.id);
        delete listOfTorrents.id;
        response.status(200).send('Removed torrent ' + listOfTorrents.id);
    } catch( err ) {
        response.status(500).send('Error : ' + err.toString() + listOfTorrents.id);
        console.log('Removing torrent error : ' + err.toString());
    }
});

var server = http.createServer(app);
server.listen(port, function() {
    console.log('Listening on http://127.0.0.1:' + port);
});


