var express = require('express');
var webtorrent = require('webtorrent');
var path = require('path');
var http = require('http');
var app = express();
var bodyParser = require("body-parser");
var fs = require('fs');
var kill = require('tree-kill');
child_process = require("child_process");
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
    for (var i = 0; i < torrent.files.length; i++) {
        if (!file || file.length < torrent.files[i].length) {
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

        if (!request.body.torrent ||  !request.body.id) {
            response.status(500).send('Missing torrent info in request!');
            return;
        }
	var id = '';
        id = request.body.id;
        if (listOfTorrents[id] !== undefined) {
            console.log("torrent not added, because it seems to already exist");
            console.log(listOfTorrents[id]);
		response.status(200).send('torrent with id ' + id +'already exists, skipping...');
            return;
        }
        torrentID = fs.readFileSync(request.body.torrent);
        client.add(torrentID, function(torrent) {
            var file = getLargestFile(torrent);
            torrent.swarm.on('upload', function() {
                if (torrent.length == torrent.downloaded) {
                    torrent.destroy();
                    //torrent.discovery.stop();
                    delete listOfTorrents[id];
                }

            });
            var id = '';
	    id = request.body.id;
            listOfTorrents[id] = request.body.torrent;
            response.status(200).send('Added torrent!');
        });
        console.log("Torrent added");
    } catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log("adding torrent failed");
    }
});
/*app.get('/streamtorrent/:id', function(request, response){
    try {
        var id = request.params.id;
        var path = listOfTorrents.id;
        var torrent = client.get(fs.readFileSync(listOfTorrents.id));
        var file = getLargestFile(torrent);
        var total = file.length;
        var extension = file.name.split('.').pop();
        console.log(extension);

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


         var stream = file.createReadStream({start: start, end: end});
         response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
         stream.pipe(response);


    } catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log('getting stream failed' + err.toString());
    }


});*/


app.get('/filetotranscode/:id', function(request, response) {
    try {
        var id = ''; 
	id = request.params.id;
        var path = listOfTorrents[id];
        var torrent = client.get(fs.readFileSync(listOfTorrents[id]));
        var file = getLargestFile(torrent);
        var total = file.length;
        var extension = file.name.split('.').pop();
        console.log(extension);
        console.log(file.name);


        if (typeof request.headers.range != 'undefined') {
            var range = request.headers.range;
            var parts = range.replace(/bytes=/, "").split("-");
            var partialstart = parts[0];
            var partialend = parts[1];
            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : total - 1;
            var chunksize = (end - start) + 1;
        } else {
            var start = 0;
            var end = total;
        }


        var stream = file.createReadStream({ start: start, end: end });
        response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize });
        stream.pipe(response);


    } catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log('getting stream failed' + err.toString());
    }
});
function fullEncode(port, id) {
    return child_process.spawn("ffmpeg", [
                // Real time mode
                 //"-re",

                // Source
                "-i", 'http://localhost:' + port + '/filetotranscode/' + id,

                // Map multiple streams
                //"-map", "0:0", "-map", "0:1", "-map", "0:1",
                "-profile:v","high",

                "-c:a","aac",

                "-crf","18",
                "-c:v", "libx264",
                "-movflags","frag_keyframe+empty_moov",
                // Some optimizations
                 "-preset","ultrafast",
                // "-tune","zerolatency",

                // Motion algorithms off
                // "-me_method","zero",
                // "-flags2","fast",

                // Quantization
                //"-qmin", "0",
                //"-qmax", "42",

                // Video: VP8 encoding
                //"-c:v", "libvpx",
                // quality

                // target bit rate
                //"-b:v", "4M",

                // Audio: Vorbis  encoding
                //"-c:a", "libvorbis",
                // target bit rate
                //"-b:a", "256K",

                // Subtitles: copy
                //"-c:s", "copy",
                //"-quality", "good",
                //"-cpu-used", "0",
                "-threads", "0",
                //"-preset","ultrafast",
                // File format
                "-f", "mp4",

                // Output to STDOUT
                "-"
            ]);
}
function repackOnly(port, id) {
    return child_process.spawn("ffmpeg", [
                // Real time mode
                //"-re",

                // Source
                "-i", 'http://localhost:' + port + '/filetotranscode/' + id,
                "-vcodec","copy",
                "-acodec","copy",
                // Map multiple streams
                //"-map", "0:0", "-map", "0:1", "-map", "0:1",
                //"-profile:v","high",

                //"-c:a","aac",

                //"-crf","18",
                //"-c:v", "libx264",
                "-movflags","frag_keyframe+empty_moov",
                // Some optimizations
                 //"-preset","ultrafast",
                // "-tune","zerolatency",

                // Motion algorithms off
                // "-me_method","zero",
                // "-flags2","fast",

                // Quantization
                //"-qmin", "0",
                //"-qmax", "42",

                // Video: VP8 encoding
                //"-c:v", "libvpx",
                // quality

                // target bit rate
                //"-b:v", "4M",

                // Audio: Vorbis  encoding
                //"-c:a", "libvorbis",
                // target bit rate
                //"-b:a", "256K",

                // Subtitles: copy
                //"-c:s", "copy",
                //"-quality", "good",
                //"-cpu-used", "0",
                "-threads", "0",
                //"-preset","ultrafast",
                // File format
                "-f", "mp4",

                // Output to STDOUT
                "-"
            ]);
}
function keepAudioCodec(port, id){
    return child_process.spawn("ffmpeg", [
                // Real time mode
                //"-re",

                // Source
                "-i", 'http://localhost:' + port + '/filetotranscode/' + id,

                // Map multiple streams
                //"-map", "0:0", "-map", "0:1", "-map", "0:1",
                "-profile:v","high",

                "-acodec","copy",

                "-crf","18",
                "-c:v", "libx264",
                "-movflags","frag_keyframe+empty_moov",
                // Some optimizations
                 "-preset","ultrafast",
                // "-tune","zerolatency",

                // Motion algorithms off
                // "-me_method","zero",
                // "-flags2","fast",

                // Quantization
                //"-qmin", "0",
                //"-qmax", "42",

                // Video: VP8 encoding
                //"-c:v", "libvpx",
                // quality

                // target bit rate
                //"-b:v", "4M",

                // Audio: Vorbis  encoding
                //"-c:a", "libvorbis",
                // target bit rate
                //"-b:a", "256K",

                // Subtitles: copy
                //"-c:s", "copy",
                //"-quality", "good",
                //"-cpu-used", "0",
                "-threads", "0",
                //"-preset","ultrafast",
                // File format
                "-f", "mp4",

                // Output to STDOUT
                "-"
            ]);
}
function keepVideoCodec(port, id) {
    return child_process.spawn("ffmpeg", [
                // Real time mode
                 //"-re",

                // Source
                "-i", 'http://localhost:' + port + '/filetotranscode/' + id,
                "-vcodec","copy",
                // Map multiple streams
                //"-map", "0:0", "-map", "0:1", "-map", "0:1",
                //"-profile:v","high",

                "-c:a","aac",

                //"-crf","18",
                //"-c:v", "libx264",
                "-movflags","frag_keyframe+empty_moov",
                // Some optimizations
                 //"-preset","ultrafast",
                // "-tune","zerolatency",

                // Motion algorithms off
                // "-me_method","zero",
                // "-flags2","fast",

                // Quantization
                //"-qmin", "0",
                //"-qmax", "42",

                // Video: VP8 encoding
                //"-c:v", "libvpx",
                // quality

                // target bit rate
                //"-b:v", "4M",

                // Audio: Vorbis  encoding
                //"-c:a", "libvorbis",
                // target bit rate
                //"-b:a", "256K",

                // Subtitles: copy
                //"-c:s", "copy",
                //"-quality", "good",
                //"-cpu-used", "0",
                "-threads", "0",
                //"-preset","ultrafast",
                // File format
                "-f", "mp4",

                // Output to STDOUT
                "-"
            ]);
}
function startFFMPEG(videoCodec, audioCodec, port, id) {
    if (videoCodec ==='h264') {
        if(audioCodec ==='mp3' || audioCodec ==='aac')
            return repackOnly(port, id);
         else
            return keepVideoCodec(port, id);
    }
    else {
        if(audioCodec ==='mp3' || audioCodec ==='aac')
            return keepAudioCodec(port, id);
         else
            return fullEncode(port, id);
    }

}
app.get('/streamtorrent/:id.mp4', function(request, response) {
    try {
	var id = '';
        id = request.params.id;
        var path = listOfTorrents[id];
        var torrent = client.get(fs.readFileSync(listOfTorrents[id]));
        var file = getLargestFile(torrent);
        var total = file.length;
        var extension = file.name.split('.').pop();
        console.log(extension);
        console.log(file.name);


        if (typeof request.headers.range != 'undefined') {
            var range = request.headers.range;
            var parts = range.replace(/bytes=/, "").split("-");
            var partialstart = parts[0];
            var partialend = parts[1];
            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : total - 1;
            var chunksize = (end - start) + 1;
        } else {
            var start = 0;
            var end = total;
        }

        var stream = file.createReadStream({ start: start, end: end });

        if (extension != "mp4") {
            var url = 'http://localhost:' + port + '/filetotranscode/' + request.params.id +'';

             require('fluent-ffmpeg').ffprobe(url, function(err, metadata){

                var audioCodec = null;
                var videoCodec = null;
                metadata.streams.forEach(function(stream){
                if (stream.codec_type === "video"){
                    videoCodec = stream.codec_name;
                    console.log(stream);
                    }
                else if (stream.codec_type === "audio")
                    audioCodec = stream.codec_name;
                });


                console.log("Video codec: %s\nAudio codec: %s", videoCodec, audioCodec);
                var ffmpeg = startFFMPEG(videoCodec, audioCodec, port, id);
                CurrentTranscodings.id = ffmpeg;
                    //response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
                    // Pipe the video output to the client response
                ffmpeg.stdout.pipe(response/*, { end: true }*/);
                ffmpeg.stderr.on('data', (data) => {
                    console.log(`stderr: ${data}`);
                });
                response.on("close", function() {
                    console.log('killing ffmpeg :  ' + ffmpeg.pid);
                    kill(ffmpeg.pid, 'SIGKILL');
                });
             });








            // Kill the subprocesses when client disconnects

                //var stream = fs.createReadStream(output, {start:start});*/
        } else {
            var stream = file.createReadStream({ start: start, end: end });
            response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
            stream.pipe(response);
        }

    } catch (err) {
        response.status(500).send('Error: ' + err.toString());
        console.log('getting stream failed' + err.toString());
    }
});

app.get('/delete/:id', function(request, response) {
    console.log(listOfTorrents);
    if (request.params.id == 'undefined' || request.params.id == '') {
        response.status(500).send('Missing torrent ID in your request');
        return;
    }
    try {
	var id = '';
        id = request.params.id;
        var torrent = client.remove(fs.readFileSync(listOfTorrents[id]));
        console.log('Removed torrent' + listOfTorrents[id]);
        delete listOfTorrents[id];
        response.status(200).send('Removed torrent ' + listOfTorrents[id]);

    } catch (err) {
        response.status(500).send('Error : ' + err.toString() + listOfTorrents[id]);
        console.log('Removing torrent error : ' + err.toString());
    }
});

var server = http.createServer(app);
server.listen(port, function() {
    console.log('Listening on http://127.0.0.1:' + port);
});
