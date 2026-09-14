import { PortfolioMarginEngineAbi } from "@hashpower/collateral-abi";
import { HashPowerFuturesAbi } from "@hashpower/futures-abi";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import { chainHead } from "../chain.ts";
import type { ChainClient } from "../chain.ts";
import type { DeploymentsManifest } from "../deployments.ts";
import { requireContract } from "../deployments.ts";
import { asAddress, parseBigIntString } from "../json.ts";
import { ok } from "./result.ts";

type Client = ChainClient;

export async function checkCanPlaceOrder(
  client: Client,
  deployments: DeploymentsManifest,
  wallet: string,
  additionalIm: string,
) {
  const address = asAddress("wallet", wallet);
  const extra = parseBigIntString("additionalIm", additionalIm);
  const engine = requireContract(deployments.environment.contracts, "PortfolioMarginEngine");
  const [allowed, head] = await Promise.all([
    client.readContract({
      address: engine,
      abi: PortfolioMarginEngineAbi,
      functionName: "canPlaceOrder",
      args: [address, extra],
    }),
    chainHead(client),
  ]);
  return ok({
    wallet: address,
    additionalIm: extra.toString(),
    canPlaceOrder: allowed,
    engine,
    chainHead: head.toString(),
    note: "View-only pre-trade gate. Production bots should call this themselves via @hashpower/collateral-abi before signing.",
  });
}

export async function simulateOrder(
  client: Client,
  deployments: DeploymentsManifest,
  args: {
    venue: "futures" | "perps";
    price: string;
    quantity: string;
    expirationAt?: string;
  },
) {
  const price = parseBigIntString("price", args.price);
  const quantity = parseBigIntString("quantity", args.quantity);
  const head = await chainHead(client);
  if (args.venue === "perps") {
    const address = requireContract(deployments.environment.contracts, "HashPowerPerpsDEX");
    const [filledQuantity, averageFillPrice, remainingQuantity] = await client.readContract({
      address,
      abi: HashPowerPerpsDEXAbi,
      functionName: "simulateOrder",
      args: [price, quantity],
    });
    return ok({
      venue: args.venue,
      address,
      price: price.toString(),
      quantity: quantity.toString(),
      filledQuantity: filledQuantity.toString(),
      averageFillPrice: averageFillPrice.toString(),
      remainingQuantity: remainingQuantity.toString(),
      chainHead: head.toString(),
      note: "On-chain view. Positive quantity = buy, negative = sell. Does not place an order.",
    });
  }
  if (!args.expirationAt) {
    throw new Error("expirationAt is required to simulate a futures order");
  }
  const expirationAt = parseBigIntString("expirationAt", args.expirationAt);
  const address = requireContract(deployments.environment.contracts, "HashPowerFutures", "Futures");
  const [filledQuantity, averageFillPrice, remainingQuantity] = await client.readContract({
    address,
    abi: HashPowerFuturesAbi,
    functionName: "simulateOrder",
    args: [expirationAt, price, quantity],
  });
  return ok({
    venue: args.venue,
    address,
    expirationAt: expirationAt.toString(),
    price: price.toString(),
    quantity: quantity.toString(),
    filledQuantity: filledQuantity.toString(),
    averageFillPrice: averageFillPrice.toString(),
    remainingQuantity: remainingQuantity.toString(),
    chainHead: head.toString(),
    note: "On-chain view. Positive quantity = buy, negative = sell. Does not place an order.",
  });
}
