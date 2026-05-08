/**
 * Reusable responses
 */
import { ResponseDocsModifier } from "@kaapi/kaapi";

export const badRequestResponse = new ResponseDocsModifier("BadRequestResponse")
  .setDescription("Bad Request")
  .addMediaType("application/json", {
    schema: {
      type: "object",
      properties: {
        statusCode: {
          type: "number",
          enum: [400],
        },
        error: { type: "string", enum: ["Bad Request"] },
        message: { type: "string" },
      },
      required: ["statusCode", "error"],
    },
  });
