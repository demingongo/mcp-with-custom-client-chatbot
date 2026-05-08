/**
 * Reusable schemas
 */
import { SchemaModifier } from "@kaapi/kaapi";

export const errorSchema = new SchemaModifier("Error", {
  type: "object",
  properties: {
    statusCode: {
      type: "number",
    },
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["statusCode", "error"],
});
