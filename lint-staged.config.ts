const lockfilePattern =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|bun\.lock|yarn\.lock|npm-shrinkwrap\.json)$/;

const withoutLockfiles = (filenames: string[]): string[] =>
  filenames.filter((file) => !lockfilePattern.test(file));

const quote = (file: string): string => `"${file.replaceAll('"', '\\"')}"`;

const oxfmtFiles = (filenames: string[]): string | null => {
  const files = withoutLockfiles(filenames);

  if (files.length === 0) {
    return null;
  }

  return `oxfmt ${files.map(quote).join(" ")}`;
};

/** @type {import("lint-staged").Config} */
export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": (filenames: string[]) => {
    const oxfmt = oxfmtFiles(filenames);

    if (!oxfmt) {
      return [];
    }

    const files = withoutLockfiles(filenames);

    return [oxfmt, `oxlint --fix ${files.map(quote).join(" ")}`];
  },
  "*.{json,jsonc,md,yaml,yml,css,html}": (filenames: string[]) => {
    const command = oxfmtFiles(filenames);

    return command ?? [];
  },
};
