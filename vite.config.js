import { defineConfig } from "vite";
import parseArgs from "minimist";
import { config as readEnv } from "dotenv";
import { screeps } from 'rollup-plugin-screeps2';

const args = parseArgs(process.argv.slice(process.argv.indexOf("--") + 1));
readEnv();

export default defineConfig({
  mode: args.prod ? 'production' : 'development',
  build: {
    lib: {
      entry: "lib/es6/loop.bs.js",
      formats: ["cjs"],
    },
    sourcemap: true,
  },
  plugins: [screeps({
    token: args.token ?? process.env.token,
    protocol: args.protocol ?? process.env.protocol,
    hostname: args.hostname ?? process.env.hostname,
    port: args.port ?? process.env.port,
    path: args.path ?? process.env.path,
    branch: args.branch ?? process.env.branch ?? args._[0],
  })],
});

