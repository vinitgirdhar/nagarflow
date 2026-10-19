import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function loadConfig(overrides = {}) {
  const environment = { ...process.env };
  for (const key of ["NETLIFY", "NAGARFLOW_BACKEND_URL", "URL", "DEPLOY_URL", "DEPLOY_PRIME_URL", "NODE_TEST_CONTEXT"]) {
    delete environment[key];
  }
  return spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import config from './next.config.ts';
    console.log(JSON.stringify({ output: config.output ?? null, rewrites: await config.rewrites() }));
  `], { cwd: new URL("..", import.meta.url), env: { ...environment, ...overrides }, encoding: "utf8" });
}

test("Netlify refuses a deployment without a configured backend", () => {
  for (const backend of [undefined, "", "   "]) {
    const result = loadConfig({ NETLIFY: "true", ...(backend === undefined ? {} : { NAGARFLOW_BACKEND_URL: backend }) });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Netlify requires NAGARFLOW_BACKEND_URL/);
  }
});

test("Netlify refuses malformed origins and local backends", () => {
  for (const backend of [
    "not a URL", "http://backend.example.test", "https://backend.example.test/api",
    "https://user:password@backend.example.test", "https://backend.example.test?token=private",
    "https://backend.example.test#fragment", "https://localhost", "https://127.0.0.1",
    "https://127.1", "https://0.0.0.0", "https://[::1]", "https://[::]", "https://api.localhost.",
    "https://[::ffff:127.0.0.1]", "https://[::ffff:0.0.0.0]",
  ]) {
    const result = loadConfig({ NETLIFY: "true", NAGARFLOW_BACKEND_URL: backend });
    assert.notEqual(result.status, 0, "An invalid deployment backend must fail configuration");
    assert.match(result.stderr, /HTTPS origin|loopback backend/);
  }
});

test("Netlify refuses proxy loops to its production and preview URLs", () => {
  for (const key of ["URL", "DEPLOY_URL", "DEPLOY_PRIME_URL"]) {
    for (const hostname of ["nagarflow.example.test", "nagarflow.example.test."]) {
      const result = loadConfig({ NETLIFY: "true", NAGARFLOW_BACKEND_URL: `https://${hostname}/`, [key]: "https://nagarflow.example.test" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /proxy loop/);
    }
  }
});

test("Netlify proxies API and private media to the external origin with runtime output", () => {
  const result = loadConfig({ NETLIFY: "true", NAGARFLOW_BACKEND_URL: " https://BACKEND.example.test:443/ ", URL: "https://frontend.example.test" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    output: null,
    rewrites: [
      { source: "/api/:path*", destination: "https://backend.example.test/api/:path*" },
      { source: "/uploads/:path*", destination: "https://backend.example.test/uploads/:path*" },
    ],
  });
});

test("Render and local servers retain standalone output and the private API", () => {
  const result = loadConfig();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.output, "standalone");
  assert.equal(config.rewrites[0].destination, "http://127.0.0.1:5000/api/:path*");

  const custom = loadConfig({ NAGARFLOW_BACKEND_URL: "http://127.0.0.1:5002/" });
  assert.equal(custom.status, 0, custom.stderr);
  assert.equal(JSON.parse(custom.stdout).rewrites[0].destination, "http://127.0.0.1:5002/api/:path*");
});
