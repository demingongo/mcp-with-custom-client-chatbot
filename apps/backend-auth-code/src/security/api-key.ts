import { APIKeyAuthDesign } from '@kaapi/kaapi';
import { getUserTokens } from "../services/user-token-store";
import { OAuthTokens } from '@modelcontextprotocol/client';
import Boom from '@hapi/boom';

export interface ApiKeyAuthCredentials {
    user: {
        userTokens: OAuthTokens;
        token: string;
    };
}

export const apiKeyAuthDesign = new APIKeyAuthDesign({
    strategyName: "api-key-auth",
    auth: {
        async validate(_, token) {
            const userTokens = getUserTokens(token);
            if (userTokens) {

                return {
                    isValid: true,
                    credentials: {
                        user: {
                            userTokens,
                            token
                        },
                    },
                };
            }

            const error = Boom.unauthorized("Invalid API key");
            error.output.payload.ok = false;
            error.output.payload.loginRequired = true;
            return error;
        },
        headerTokenType: 'Bearer',
    },
    key: 'authorization',
})
    .inHeader()
    .setDescription('API key authentication design');