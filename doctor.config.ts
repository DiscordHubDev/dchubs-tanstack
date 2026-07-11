import type { ReactDoctorConfig } from "react-doctor/api";

export default {
  ignore: {
    rules: ["react/no-danger", "jsx-a11y/no-autofocus"],

    files: ["dist/**", ".output/**", ".nitro/**", "src/drizzle/**"],

    overrides: [
      {
        files: ["src/**/components/**"],
        rules: ["react-doctor/no-array-index-as-key"],
      },
    ],
  },
} satisfies ReactDoctorConfig;
