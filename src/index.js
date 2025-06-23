const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

const PORT = 80;
const HOST = "0.0.0.0";
const CACHE_DURATION_MS = 30 * 60 * 1000;

let cachedCompressedProxies = null;
let lastFetchTime = 0;
let isFetching = false;

const links = readFileSync("./data/proxies.txt", "utf-8").trim().split("\n");

const getAllProxies = async () => {
    const uniqueProxies = new Set();

    await Promise.all(links.map(async (link) => {
        try {
            const res = await fetch(link, { signal: AbortSignal.timeout(15000) }).catch(() => null);

            if (res && res.ok) {
                const body = await res.text();
                body.trim().split("\n").forEach((proxy) => {
                    if (proxy.trim()) uniqueProxies.add(proxy.trim());
                });
            } else {
                console.error(`[Proxy] ${link} returned ${res ? res.status : "error"}`);
            }
        } catch (error) {
            if (error.name !== 'TimeoutError') {
                console.error(error);
            }
        }
    }));

    return Array.from(uniqueProxies).join("\n");
};

const updateCache = async () => {
    if (isFetching) return;
    isFetching = true;

    try {
        const proxiesText = await getAllProxies();
        if (proxiesText) {
            cachedCompressedProxies = gzipSync(Buffer.from(proxiesText));
            lastFetchTime = Date.now();
            console.log(`Proxy cache updated with ${proxiesText.split('\n').length} unique proxies.`);
        } else {
            console.error("Failed to fetch any proxies, cache not updated.");
        }
    } catch (error) {
        console.error("Error updating proxy cache:", error);
    } finally {
        isFetching = false;
    }
};

const server = createServer(async (req, res) => {
    const cacheIsStale = Date.now() - lastFetchTime >= CACHE_DURATION_MS;

    if (!cachedCompressedProxies || cacheIsStale) {
        await updateCache();
    }

    if (!cachedCompressedProxies) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("Service Unavailable: Proxies are being updated.");
        return;
    }

    res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Encoding": "gzip",
    });
    res.end(cachedCompressedProxies);
});

server.listen(PORT, HOST, () => {
    console.log(`Server is listening on http://${HOST}:${PORT}`);
    updateCache();
});