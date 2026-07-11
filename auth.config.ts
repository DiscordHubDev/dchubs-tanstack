import { admin } from "better-auth/plugins";

export const authConfig = {
  plugins: [admin()],
  user: {
    modelName: "user",
    additionalFields: {
      discordId: { type: "string", required: false },
      username: { type: "string", required: false },
      avatar: { type: "string", required: false },
      banner: { type: "string", required: false },
      bannerColor: { type: "string", required: false },
      bio: { type: "string", required: false },
      social: { type: "string", required: false },
    },
  },
  session: { modelName: "authSession" },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },
};
