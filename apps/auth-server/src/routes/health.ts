import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";

export const healthRoute = applyModifiers(
  {
    method: "GET",
    path: "/health",
    handler: () => ({ status: "ok" }),
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
              },
              required: ["status"],
            })
            .setExample({
              status: "ok",
            })
        )
        .setCode(200)
    ),
  }
);
