import { Interface, zeroPadValue } from "ethers";
import { Token, Transaction } from "@/types";
import { NETWORKS, sameAddress } from "@/config/networks";
import { formatAmount } from "@/lib/amounts";
import { direction } from "@/lib/history";
const events = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export const transferTopic = events.getEvent("Transfer")!.topicHash;
export const addressTopic = (address: string) => zeroPadValue(address, 32);
export function tokenTransfer(
  log: {
    topics: readonly string[];
    data: string;
    transactionHash: string;
    index: number;
    removed?: boolean;
  },
  token: Token,
  owner: string,
  timestamp: number,
): Transaction | null {
  if (log.removed || log.topics.length !== 3) return null;
  const event = events.parseLog({ topics: [...log.topics], data: log.data });
  if (
    !event ||
    ![event.args.from, event.args.to].some((a) =>
      sameAddress(token.network, a, owner),
    )
  )
    return null;
  return {
    hash: log.transactionHash,
    network: token.network,
    networkId: NETWORKS[token.network].id,
    from: event.args.from,
    to: event.args.to,
    value: formatAmount(event.args.value, token.decimals),
    tokenAddress: token.address.toLowerCase(),
    tokenSymbol: token.symbol,
    eventIndex: log.index,
    timestamp,
    status: "confirmed",
    type: direction(token.network, owner, event.args.from, event.args.to),
  };
}
