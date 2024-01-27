const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

let cachedProxies = [];
let lastFetchTime = 0;
const links = readFileSync("./data/proxies.txt", "utf-8").trim().split("\n");

const server = createServer(async (req, res) => {
    try {
        const currentTime = Date.now();

        if (cachedProxies.length === 0 || currentTime - lastFetchTime >= 15 * 60 * 1000) {
            const proxies = await getAllProxies();
            cachedProxies = proxies;
            lastFetchTime = currentTime;
        }

        if (cachedProxies.length === 0) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("No proxies found, fetch again!!");
            return;
        }

        res.writeHead(200, { "Content-Type": "text/plain", "Content-Encoding": "gzip" });
        const compressedData = gzipSync(Buffer.from(cachedProxies.join("")));
        res.end(compressedData);
    } catch (error) {
        console.error(error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
    }
});

const getAllProxies = async () => {
    const uniqueProxies = new Set();

    await Promise.all(links.map(async (link) => {
        try {
            const res = await fetch(link).catch(() => null);

            if (res && res.status === 200) {
                const body = await res.text();
                const proxies = body.trim().split("\n");

                proxies.forEach((proxy) => uniqueProxies.add(`${proxy.trim()}\n`));
            } else {
                console.error(`[Proxy] ${link} returned ${res ? res.status : "error"} status code.`);
            }
        } catch (error) {
            console.error(error);
        }
    }));

    return Array.from(uniqueProxies);
};

const PORT = 80;
const HOST = "0.0.0.0";

getAllProxies();
server.listen(PORT, HOST, () => {
    console.log(`Server is listening on http://${HOST}:${PORT}`);
});
