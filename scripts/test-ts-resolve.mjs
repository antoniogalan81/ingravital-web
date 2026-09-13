// Hook de resolución SOLO para `node --test`: permite que módulos de `src/` probados sin
// bundler importen otros módulos locales sin extensión (como hace Next con webpack).
// No afecta al build ni a la app.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (err) {
          const local = specifier.startsWith("./") || specifier.startsWith("../");
          if (!local || /\.[cm]?[jt]sx?$/.test(specifier)) throw err;
          return next(specifier + ".ts", context);
        }
      }
    `),
  import.meta.url,
);
