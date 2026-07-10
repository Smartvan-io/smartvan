// Dev build: bundles the mock-backed entry (src/sv-dev.js) into
// dev/dev-bundle.js, unminified with sourcemaps. In watch mode it also serves
// dev/ on http://127.0.0.1:5599 with SPA history fallback and live-reloads the
// browser on every rebuild. Never used for the production bundle.
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

const watching = process.env.ROLLUP_WATCH === "true";

export default {
  input: "src/sv-dev.js",
  output: {
    file: "dev/dev-bundle.js",
    format: "es",
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    replace({
      preventAssignment: true,
      "process.env.NODE_ENV": JSON.stringify("development"),
    }),
    resolve(),
    commonjs(),
    ...(watching
      ? [
          serve({
            contentBase: "dev",
            host: "127.0.0.1",
            port: 5599,
            historyApiFallback: true,
          }),
          livereload({ watch: "dev", delay: 150 }),
        ]
      : []),
  ],
};
