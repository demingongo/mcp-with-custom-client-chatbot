import { JsonRpcId, JsonRpcResponse, McpToolDefinition, McpToolInputSchema } from "../../types";
import { rpcError, toolResult, success } from "./json-rpc-helpers";
import { core, util, z, ZodObject } from "zod";

export type ZodSchema<T extends core.$ZodLooseShape = Partial<Record<never, core.SomeType>>> = ZodObject<
  util.Writeable<T>,
  core.$strip | core.$loose
>;

export interface McpToolOptions<R = unknown> {
  preResponse?: (id: JsonRpcId | undefined, result: R) => Promise<JsonRpcResponse> | JsonRpcResponse;
  title?: string;
}

export class McpTool<R = unknown, T extends core.$ZodLooseShape = Partial<Record<never, core.SomeType>>> {
  #description: string;
  #name: string;
  #ctrl: (args: z.infer<ZodSchema<T>>) => Promise<R> | R;
  #preResponse?: (id: JsonRpcId | undefined, result: R) => Promise<JsonRpcResponse> | JsonRpcResponse;
  #schema?: ZodSchema<T>;
  #title?: string;

  constructor(
    name: string,
    description: string,
    schema: ZodSchema<T>,
    ctrl: (args: z.infer<typeof schema>) => Promise<R> | R,
    options: McpToolOptions<R>
  ) {
    this.#schema = schema;
    this.#ctrl = ctrl;
    this.#preResponse = options.preResponse;
    this.#title = options.title;
    this.#description = description;
    this.#name = name;
  }

  get name(): string {
    return this.#name;
  }

  get title(): string | undefined {
    return this.#title;
  }

  get description(): string {
    return this.#description;
  }

  get inputSchema(): McpToolInputSchema {
    const jsonSchema = this.#schema ? this.#schema.toJSONSchema() : { type: "object", properties: {} };
    if (jsonSchema.type === "object") {
      return {
        ...jsonSchema,
        type: "object",
        properties: jsonSchema.properties || {},
      };
    }
    throw new Error("Input schema must be an object");
  }

  async call(id: JsonRpcId | undefined, args: unknown): Promise<JsonRpcResponse> {
    if (this.#schema) {
      const val = await this.#schema.safeParseAsync(args);
      if (!val.success) {
        return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
      }
      const res = await this.#ctrl(val.data);
      if (this.#preResponse) {
        return await this.#preResponse(id, res);
      }
      return success(id, toolResult(res));
    } else {
      const res = await this.#ctrl(args as never);
      return success(id, toolResult(res));
    }
  }
}

export interface Credentials {
  app?: unknown;
  user?: unknown;
  scope?: unknown;
}

export type Controller<A = unknown, R = unknown, C extends Credentials = Credentials> = (
  args: A,
  creds: C
) => Promise<R> | R;

export class McpToolOptionalArgs<
  R = unknown,
  T extends core.$ZodLooseShape = Partial<Record<never, core.SomeType>>,
  C extends Credentials = Credentials,
> {
  #description: string;
  #name: string;
  #ctrl: Controller<unknown, R, C>;
  #preResponse?: (id: JsonRpcId | undefined, result: R) => Promise<JsonRpcResponse> | JsonRpcResponse;
  #schema?: ZodSchema<T> | undefined | null;
  #title?: string | undefined;

  constructor(
    name: string,
    description: string,
    schema: ZodSchema<T>,
    ctrl: Controller<z.infer<ZodSchema<T>>, R, C>,
    options: McpToolOptions<R>
  );
  constructor(
    name: string,
    description: string,
    schema: undefined | null,
    ctrl: Controller<unknown, R, C>,
    options: McpToolOptions<R>
  );
  constructor(
    name: string,
    description: string,
    schema: ZodSchema<T> | undefined | null,
    ctrl: Controller<z.infer<ZodSchema<T>>, R, C>,
    options: McpToolOptions<R>
  ) {
    this.#schema = schema;
    this.#ctrl = ctrl as Controller<unknown, R, C>;
    this.#preResponse = options.preResponse;
    this.#title = options.title;
    this.#description = description;
    this.#name = name;
  }

  get name(): string {
    return this.#name;
  }

  get title(): string | undefined {
    return this.#title;
  }

  get description(): string {
    return this.#description;
  }

  get inputSchema(): McpToolInputSchema {
    const jsonSchema = this.#schema ? this.#schema.toJSONSchema() : { type: "object", properties: {} };
    if (jsonSchema.type === "object") {
      return {
        ...jsonSchema,
        type: jsonSchema.type,
        properties: jsonSchema.properties || {},
      };
    }
    throw new Error("Input schema must be an object");
  }

  async call(id: JsonRpcId | undefined, args: unknown, credentials: C): Promise<JsonRpcResponse> {
    try {
      if (this.#schema) {
        const val = await this.#schema.safeParseAsync(args);
        if (!val.success) {
          return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
        }
        const res = await this.#ctrl(val.data, credentials);
        if (this.#preResponse) {
          return await this.#preResponse(id, res);
        }
        return success(id, toolResult(res));
      } else {
        const res = await this.#ctrl(args, credentials);
        if (this.#preResponse) {
          return await this.#preResponse(id, res);
        }
        return success(id, toolResult(res));
      }
    } catch (err) {
      return rpcError(id, -32603, `Internal error: ${(err as Error)?.message}`);
    }
  }
}

export class McpToolBase<R = unknown, C extends Credentials = Credentials> {
  protected ctrl: Controller<unknown, R, C>;
  protected preResponse?: (id: JsonRpcId | undefined, result: R) => Promise<JsonRpcResponse> | JsonRpcResponse;
  protected definition: McpToolDefinition;

  constructor(
    name: string,
    description: string,
    inputSchema: McpToolInputSchema,
    ctrl: Controller<unknown, R, C>,
    options: McpToolOptions<R>
  ) {
    this.ctrl = ctrl as Controller<unknown, R, C>;
    this.preResponse = options.preResponse;
    this.definition = {
      name,
      description,
      inputSchema,
      title: options.title,
    };
  }

  get name(): string {
    return this.definition.name;
  }

  get title(): string | undefined {
    return this.definition.title;
  }

  get description(): string {
    return this.definition.description;
  }

  get inputSchema(): McpToolInputSchema {
    return this.definition.inputSchema;
  }

  async call(id: JsonRpcId | undefined, args: unknown, credentials: C): Promise<JsonRpcResponse> {
    try {
      const res = await this.ctrl(args, credentials);
      if (this.preResponse) {
        return await this.preResponse(id, res);
      }
      return success(id, toolResult(res));
    } catch (err) {
      return rpcError(id, -32603, `Internal error: ${(err as Error)?.message}`);
    }
  }
}

export class McpToolWithZod<
  R = unknown,
  T extends core.$ZodLooseShape = Partial<Record<never, core.SomeType>>,
  C extends Credentials = Credentials,
> extends McpToolBase<R, C> {
  #schema?: ZodSchema<T> | undefined | null;

  constructor(
    name: string,
    description: string,
    schema: ZodSchema<T>,
    ctrl: Controller<z.infer<ZodSchema<T>>, R, C>,
    options: McpToolOptions<R>
  );
  constructor(
    name: string,
    description: string,
    schema: undefined | null,
    ctrl: Controller<unknown, R, C>,
    options: McpToolOptions<R>
  );
  constructor(
    name: string,
    description: string,
    schema: ZodSchema<T> | undefined | null,
    ctrl: Controller<z.infer<ZodSchema<T>>, R, C>,
    options: McpToolOptions<R>
  ) {
    const jsonSchema = schema ? schema.toJSONSchema() : { type: "object", properties: {} };
    if (jsonSchema.type !== "object") {
      throw new Error("Input schema must be an object");
    }

    super(
      name,
      description,
      {
        ...jsonSchema,
        type: jsonSchema.type,
        properties: jsonSchema.properties || {},
      },
      ctrl as Controller<unknown, R, C>,
      options
    );
    this.#schema = schema;
  }

  override async call(id: JsonRpcId | undefined, args: unknown, credentials: C): Promise<JsonRpcResponse> {
    if (this.#schema) {
      const val = await this.#schema.safeParseAsync(args);
      if (!val.success) {
        return rpcError(id, -32602, `Invalid arguments: ${val.error.message}`);
      }
      return super.call(id, val.data, credentials);
    } else {
      return super.call(id, args, credentials);
    }
  }
}

const tool = new McpToolWithZod(
  "echo",
  "Echoes the input arguments",
  z.object({
    message: z.string().optional(),
  }),
  async ({ message }): Promise<{ echoed: string | undefined }> => {
    return { echoed: message };
  },
  {
    title: "Echo Tool",
    preResponse: async (id, result) => {
      return success(id, toolResult(result));
    },
  }
);

tool.call("1", { message: "Hello, world!" }, { user: { id: "123", name: "Alice" } });
