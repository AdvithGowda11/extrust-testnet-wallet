import "server-only";
import { getBitcoinApiBase } from "@/lib/serverNetworks";
import { upstream, limitedText, HttpError, upstreamJson } from "@/lib/http";
let verifiedUntil = 0;
let verification: Promise<void> | undefined;
function verifySignet() {
  if (Date.now() <= verifiedUntil) return Promise.resolve();
  if (!verification) {
    verification = (async () => {
      const hash = await limitedText(
        await upstream(`${getBitcoinApiBase()}/block-height/0`),
        100,
      );
      if (
        hash.trim() !==
        "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6"
      )
        throw new HttpError("Bitcoin endpoint is not Signet", 503);
      verifiedUntil = Date.now() + 30000;
    })().finally(() => {
      verification = undefined;
    });
  }
  return verification;
}
export async function bitcoinApi(path: string, raw?: string): Promise<any> {
  const url = `${getBitcoinApiBase()}/${path}`;
  if (raw !== undefined) {
    await verifySignet();
    return (
      await limitedText(
        await upstream(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: raw,
        }),
        200,
      )
    ).trim();
  }
  const verified = verifySignet();
  const data =
    path.endsWith("/hex") || path === "blocks/tip/height"
      ? upstream(url)
          .then((response) => limitedText(response, 400000))
          .then((text) => text.trim())
      : upstreamJson(url);
  const [, result] = await Promise.all([verified, data]);
  return result;
}
