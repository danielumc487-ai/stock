const fs = require("fs");
const http = require("http");
const path = require("path");
const quoteHandler = require("./api/quote");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.setHeader("content-type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/quote")) {
    quoteHandler(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Stock Lens running at http://127.0.0.1:${port}`);
});
