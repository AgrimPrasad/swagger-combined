var config = require('config');
var request = require('request');
var q = require('q');
var express = require('express');
var app = express();
var https = require('https');
var http = require('http');
var url = require('url');
var fs = require('fs');


// cross origin
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

// list all swagger document urls
var listUrl = config.get("list_url");

// location to save combined json file
var save_location = __dirname + "/" + config.get("save_location", "");

// general infor of your application
var info = config.get("info");
app.get('/docs', function(req, res) {
    var schemes = [ req.protocol ];
    if (config.has('schemes')) {
        schemes = config.get('schemes', false);
    }
    getApis(listUrl).then(function(data){
        var ret = data.reduce(function(a, i){
            if (!a) {
                a = Object.assign({}, i);
                a.paths = {};
                a.definitions = {};
            }
            // combines paths
            for (var key in i.paths){
                a.paths[key] = i.paths[key];
            }
            // combines definitions
            for (var k in i.definitions){
                a.definitions[k] = i.definitions[k];
            }
            return a;
        }, false);
        ret.info = info;
        ret.host = config.get("host");;
        ret.basePath = config.get("base_path");
        ret.schemes = schemes;
        ret.consumes = config.get("consumes");
        ret.produces = config.get("produces");
        jsonStr = JSON.stringify(ret, null, 4);
        saveCombinedJson(jsonStr);
        res.setHeader('Content-Type', 'application/json');
        res.send(jsonStr);
    });
});

var doForward = function(req, res, baseUrl, p) {
    try {
        console.log('doForward %s', baseUrl);
        console.log('With path', req.path);
        if (url.parse(baseUrl).protocol === 'https:') {
            p.web(req, res, {
                target: baseUrl,
                agent : https.globalAgent ,
                headers: {
                    host: url.parse(baseUrl).hostname
                }
            }, function(e) {
                console.log(e);
                res.status(500).json({});
            });
        } else {
            p.web(req, res, {
                target: baseUrl,
                agent : http.globalAgent ,
                headers: {
                    host: url.parse(baseUrl).hostname
                }
            }, function(e) {
                console.log(e);
                res.status(500).json({});
            });
        }
    } catch (e) {
        console.log(e);
    }
}

// addon swagger page
// app.use('/', express.static(__dirname + '/swagger-ui/'));
app.use('/', express.static(__dirname + '/redoc/'));

// Start web server at port 3000
var port = config.get("port");
var save_only = config.get("save_only", false)
var server = app.listen(port, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Combines swaggers http://%s:%s', host, port);
    if (save_only) {
        //ugly hack to combine and save json file with call to created endpoint
        endpoint = 'http://localhost:' + port + '/docs'
        http.get(endpoint, function(res) {
            if (res.statusCode != 200) {
                console.log('HTTP GET to http://%s:%s failed! Failed to save combined json file.', host, port);
                process.exit(1);
            } else {
                console.log('HTTP GET to http://%s:%s succeeded. Save combined json file successfully to %s', host, port, save_location);
                process.exit(0);
            }
        });
    }
});

// get swagger json data from urls
var getApis = function(urls){
    var the_promises = [];
    urls.forEach(function(url){
        var def = q.defer();
        // Check if docs is a url, if yes, then send http request
        if (url.docs.indexOf('http://') === 0 || url.docs.indexOf('https://') === 0) {
            request(url.docs, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    body = JSON.parse(body);
                    def.resolve(body);
                } else {
                    console.log(error)
                }
            });
        } else { // if docs is a local relative json file, load it from the filesystem
            docs_location = __dirname + "/" + url.docs;
            console.log("JSON file location: ", docs_location);
            fs.readFile(docs_location, 'utf8', function (error, body) {
              if (!error) {
                  body = JSON.parse(body);
                  def.resolve(body);
              } else {
                console.log(error)
              }
            });
        }
        the_promises.push(def.promise);
    });
    return q.all(the_promises);
}

var saveCombinedJson = function(json_str) {
    if (save_location === "") {
        return;
    }
    fs.writeFile(save_location, json_str, function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The combined JSON file was saved to " + save_location);
    });
}
