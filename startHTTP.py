#!/usr/local/bin/python2

import SimpleHTTPServer, SocketServer
import urlparse, os


# capable of serving angular2 apps built with ng build -prod...


# python >3
#python -m http.server

# python <3
#python -m SimpleHTTPServer

#Taken from:
#http://stackoverflow.com/users/1074592/fakerainbrigand
#http://stackoverflow.com/questions/15401815/python-simplehttpserver

# Apache:
# RewriteEngine on
# # Don't rewrite files or directories
# RewriteCond %{REQUEST_FILENAME} -f [OR]
# RewriteCond %{REQUEST_FILENAME} -d
# RewriteRule ^ - [L]
#
# # Rewrite everything else to index.html to allow html5 state links
# RewriteRule ^ index.html [L]

PORT = 8000
INDEXFILE = 'index.html'

print "load up http://0.0.0.0:8000/index.html"


class MyHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
   def do_GET(self):

    # Parse query data to find out what was requested
    parsedParams = urlparse.urlparse(self.path)

     # See if the file requested exists
    if os.access('.' + os.sep + parsedParams.path, os.R_OK):
        # File exists, serve it up
        SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self);
    else:
        # send index.html, but don't redirect
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        with open(INDEXFILE, 'r') as fin:
          self.copyfile(fin, self.wfile)

Handler = MyHandler

httpd = SocketServer.TCPServer(("", PORT), Handler)

print "serving at port", PORT
httpd.serve_forever()

