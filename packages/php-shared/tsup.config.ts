import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm"],
  dts: true,
  bundle: false,
  clean: true,
  target: "node22",
  sourcemap: true,
});
