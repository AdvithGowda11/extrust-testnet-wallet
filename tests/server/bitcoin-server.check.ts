// Run: node --conditions=react-server --import tsx --test tests/server/bitcoin-server.check.ts
import test from "node:test";
import assert from "node:assert/strict";
import { bitcoinApi } from "../../lib/bitcoinServer";

const genesis =
  "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Signet reads overlap one identity check; identity failures never return data or broadcast", async () => {
  const originalFetch = globalThis.fetch,
    originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const gate = deferred<Response>();
    let genesisReads = 0,
      dataReads = 0,
      posts = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/block-height/0")) {
        genesisReads++;
        return gate.promise;
      }
      if (init?.method === "POST") posts++;
      dataReads++;
      return Response.json({ balance: 1820 });
    };
    let finished = false;
    const reads = Promise.all([
      bitcoinApi("address/a"),
      bitcoinApi("address/b"),
    ]).then((value) => {
      finished = true;
      return value;
    });
    assert.equal(
      genesisReads,
      1,
      "concurrent reads share identity verification",
    );
    assert.equal(
      dataReads,
      2,
      "data reads start before the genesis request completes",
    );
    await Promise.resolve();
    assert.equal(
      finished,
      false,
      "data cannot return before identity verification",
    );
    gate.resolve(new Response(genesis));
    assert.deepEqual(await reads, [{ balance: 1820 }, { balance: 1820 }]);
    assert.equal(posts, 0);

    now += 31000;
    globalThis.fetch = async (input, init) => {
      if (init?.method === "POST") posts++;
      return String(input).endsWith("/block-height/0")
        ? new Response("wrong genesis")
        : Response.json({ balance: 999 });
    };
    await assert.rejects(() => bitcoinApi("address/a"), /not Signet/);
    await assert.rejects(
      () => bitcoinApi("tx", "signed-transaction"),
      /not Signet/,
    );
    assert.equal(posts, 0, "wrong identity blocks broadcast");

    globalThis.fetch = async (input, init) => {
      if (init?.method === "POST") posts++;
      return new Response("Unauthorized", { status: 401 });
    };
    await assert.rejects(
      () => bitcoinApi("tx", "signed-transaction"),
      /provider unavailable/,
    );
    assert.equal(posts, 0, "upstream authorization failure blocks broadcast");

    const postGate = deferred<Response>();
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/block-height/0")) return postGate.promise;
      if (init?.method === "POST") posts++;
      return new Response("accepted-hash\n");
    };
    const broadcast = bitcoinApi("tx", "signed-transaction");
    assert.equal(
      posts,
      0,
      "broadcast waits for successful identity verification",
    );
    postGate.resolve(new Response(genesis));
    assert.equal(await broadcast, "accepted-hash");
    assert.equal(posts, 1, "failed identity checks can be retried safely");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
