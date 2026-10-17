import "server-only";
import { getBitcoinApiBase } from "@/lib/serverNetworks";
import { upstream, limitedText, HttpError, upstreamJson } from "@/lib/http";
let verifiedUntil = 0;
export async function bitcoinApi(path: string, raw?: string): Promise<any> {
  if (Date.now() > verifiedUntil) {
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
  }
  const url = `${getBitcoinApiBase()}/${path}`;
  if (raw !== undefined)
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
  if (path.endsWith("/hex") || path === "blocks/tip/height")
    return (await limitedText(await upstream(url), 400000)).trim();
  return upstreamJson(url);
}
