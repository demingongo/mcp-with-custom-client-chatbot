import { sessions } from "../services/mcp/handler";
import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";

export const healthRoute = applyModifiers(
  {
    method: "GET",
    path: "/health",
    handler: () => ({ status: "ok", activeSessions: sessions.size }),
    options: {
      description: "Health check endpoint",
      tags: ["Health"],
    },
  },
  {
    responses: groupResponses(
      new ResponseDocsModifier("HealthCheckResponse")
        .setDescription("Response schema for health check endpoint")
        .addMediaType(
          "application/json",
          new MediaTypeModifier()
            .setSchema({
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok"] },
                activeSessions: { type: "number" },
              },
              required: ["status", "activeSessions"],
            })
            .setExample({
              status: "ok",
              activeSessions: 5,
            })
        )
        .setCode(200)
    ),
  }
);
