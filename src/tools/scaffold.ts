import { encodeFunctionData } from "viem";
import { CollateralVaultAbi } from "@hashpower/collateral-abi";
import { ERC20Abi, HashPowerFuturesAbi } from "@hashpower/futures-abi";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import type { DeploymentsManifest } from "../deployments.ts";
import { requireContract } from "../deployments.ts";
import { parseBigIntString } from "../json.ts";
import { ok } from "./result.ts";

const TIF = { GTC: 0, IOC: 1, FOK: 2 } as const;

export function buildDepositTx(deployments: DeploymentsManifest, amount: string) {
  const value = parseBigIntString("amount", amount);
  const vault = requireContract(deployments.environment.contracts, "CollateralVault");
  const token = requireContract(deployments.environment.contracts, "CollateralToken");
  const approve = encodeFunctionData({
    abi: ERC20Abi,
    functionName: "approve",
    args: [vault, value],
  });
  const deposit = encodeFunctionData({
    abi: CollateralVaultAbi,
    functionName: "deposit",
    args: [value],
  });
  return ok({
    warning:
      "PROTOTYPE ONLY. Simulate both transactions, then sign locally. This server never holds keys and must not be in the production trade path.",
    chainId: deployments.environment.chainId,
    steps: [
      { to: token, data: approve, value: "0", description: "approve USDC to CollateralVault" },
      { to: vault, data: deposit, value: "0", description: "deposit USDC into CollateralVault" },
    ],
    amount: value.toString(),
  });
}

export function buildOrderTx(
  deployments: DeploymentsManifest,
  args: {
    venue: "futures" | "perps";
    price: string;
    quantity: string;
    timeInForce: keyof typeof TIF;
    expirationAt?: string;
  },
) {
  const price = parseBigIntString("price", args.price);
  const quantity = parseBigIntString("quantity", args.quantity);
  const tif = TIF[args.timeInForce];
  if (args.venue === "perps") {
    const to = requireContract(deployments.environment.contracts, "HashPowerPerpsDEX");
    const data = encodeFunctionData({
      abi: HashPowerPerpsDEXAbi,
      functionName: "createOrder",
      args: [price, quantity, tif],
    });
    return ok({
      warning:
        "PROTOTYPE ONLY. Call simulate_order and check_can_place_order first, then sign locally. Production bots should encode via @hashpower/perps-abi themselves.",
      chainId: deployments.environment.chainId,
      to,
      data,
      value: "0",
      decoded: { venue: args.venue, price: price.toString(), quantity: quantity.toString(), timeInForce: args.timeInForce },
    });
  }
  if (!args.expirationAt) {
    throw new Error("expirationAt is required for futures createOrder");
  }
  const expirationAt = parseBigIntString("expirationAt", args.expirationAt);
  const to = requireContract(deployments.environment.contracts, "HashPowerFutures", "Futures");
  const data = encodeFunctionData({
    abi: HashPowerFuturesAbi,
    functionName: "createOrder",
    args: [price, expirationAt, quantity, tif],
  });
  return ok({
    warning:
      "PROTOTYPE ONLY. Call simulate_order and check_can_place_order first, then sign locally. Production bots should encode via @hashpower/futures-abi themselves.",
    chainId: deployments.environment.chainId,
    to,
    data,
    value: "0",
    decoded: {
      venue: args.venue,
      price: price.toString(),
      expirationAt: expirationAt.toString(),
      quantity: quantity.toString(),
      timeInForce: args.timeInForce,
    },
  });
}
