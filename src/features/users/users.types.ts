import type { Schema } from "effect";
import type { ApiJwtPayloadSchema } from "./users.schemas";

export type JWTDiscordProfile = {
  id: string;
  name?: string;
  image_url?: string;
  banner_url?: string | null;
  banner_color?: string | null;
  username?: string;
  email: string;
};

export type LegacyCompatibleSession = {
  discordProfile?: JWTDiscordProfile | null;
  user?: {
    id?: string;
    discordId?: string;
  } | null;
} | null;

export type UpdateState = {
  success?: string;
  error?: string;
};

export type UserSummary = {
  id: string;
  name: string;
  icon: string | null;
  description?: string;
  tags?: string[];
  members?: number;
  ownerId?: string;
  servers?: number;
  verified?: boolean;
  status?: "pending" | "approved" | "rejected";
};

export type UserDeveloperSummary = {
  id: string;
  username: string;
  name: string | null;
  avatar: string;
};

export type UserDevelopedBot = UserSummary & {
  developers: UserDeveloperSummary[];
};

export type UserDetail = {
  id: string;
  username: string;
  name: string | null;
  avatar: string;
  banner: string | null;
  bannerColor: string | null;
  bio: string | null;
  social: Record<string, string>;
  joinedAt: string;
  favoriteServers: UserSummary[];
  favoriteBots: UserSummary[];
  ownedServers: UserSummary[];
  developedBots: UserDevelopedBot[];
  adminIn: UserSummary[];
};

export type UserBaseProfile = {
  id: string;
  username: string;
  name: string | null;
  avatar: string;
  banner: string | null;
  bannerColor: string | null;
  bio: string | null;
  social: Record<string, string>;
  createdAt: string;
};

export type UserSettings = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  social: Record<string, string>;
  nsfw: boolean;
};

export type DevUser = {
  id: string;
  username: string;
  name: string | null;
  avatar: string;
};

export type ToggleFavoriteParams = {
  target: "server" | "bot";
  id: string;
};

export type ToggleFavoriteResult = ToggleFavoriteParams & {
  favorited: boolean;
};

export type UpdateUserSettingsInput = {
  bio: string;
  social: Record<string, string>;
  nsfw: boolean;
};

export type ApiTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type ApiJwtPayload = Schema.Schema.Type<typeof ApiJwtPayloadSchema>;
