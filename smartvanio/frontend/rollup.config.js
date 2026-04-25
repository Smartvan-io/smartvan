import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/sv-app.js",
  output: {
    // Built bundle is served by Flask from ui/static/. The Dockerfile
    // copies the result into /opt/smartvanio/ui/static/bundle.js so the
    // browser fetches it at /static/bundle.js (Ingress prefix is added
    // by the WSGI middleware in app.py).
    file: process.env.DESTINATION || "../ui/static/bundle.js",
    format: "es",
    sourcemap: false,
    inlineDynamicImports: true,
  },
  plugins: [
    replace({
      preventAssignment: true,
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),
    resolve(),
    commonjs(),
    terser(),
  ],
};
