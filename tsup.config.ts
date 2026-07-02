import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/connectors.ts",
    "src/actions.ts",
    "src/rainbow-kit.ts",
    "src/react.tsx",
    "src/privy.tsx",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: [
    "@privy-io/cross-app-connect",
    "@privy-io/react-auth",
    "@rainbow-me/rainbowkit",
    "@tanstack/react-query",
    "react",
    "viem",
    "wagmi",
  ],
});
