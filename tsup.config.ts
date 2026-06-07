import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/rainbow-kit.ts", "src/react.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: [
    "@privy-io/cross-app-connect",
    "@rainbow-me/rainbowkit",
    "@tanstack/react-query",
    "react",
    "viem",
    "wagmi",
  ],
});
