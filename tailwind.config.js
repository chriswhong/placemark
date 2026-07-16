// eslint-disable-next-line
const colors = require("tailwindcss/colors");
// eslint-disable-next-line
const plugin = require("tailwindcss/plugin");
// eslint-disable-next-line
const postcss = require("postcss");

module.exports = {
  jit: "enable",
  content: ["./{components,app,pages}/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    data: {
      "state-checked": 'state="checked"',
      "state-active": 'state="active"',
      "state-on": 'state="on"',
      "state-open": 'state="open"',
    },
    fontFamily: {
      sans: ["Nunito", "sans-serif"],
      mono: ["Source Code Pro", "monospace"],
    },
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: colors.black,
      white: colors.white,
      gray: colors.neutral,
      purple: {
        50:  "#eef7f5",
        100: "#d4ede9",
        200: "#a9dbd3",
        300: "#7ec8bc",
        400: "#4db3a5",
        500: "#1f7a6c",
        600: "#1f7a6c",
        700: "#196358",
        800: "#12312c",
        900: "#0c211e",
      },
      yellow: colors.yellow,
      red: colors.red,
    },
    extend: {
      keyframes: {
        appear: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    plugin(({ addVariant, e }) => {
      function addPointerVariant(ruleName, params) {
        addVariant(ruleName, ({ container, separator }) => {
          const pointerRule = postcss.atRule({
            name: "media",
            params,
          });
          pointerRule.append(container.nodes);
          container.append(pointerRule);
          pointerRule.walkRules((rule) => {
            rule.selector = `.${e(
              `${ruleName}${separator}${rule.selector.slice(1)}`,
            )}`;
          });
        });
      }
      addPointerVariant("pointer-coarse", "(pointer: coarse");
      addPointerVariant("pointer-fine", "(pointer: fine");
      addPointerVariant("pointer-none", "(pointer: none");
      addVariant("hover-hover", ({ container, separator }) => {
        const hoverHover = postcss.atRule({
          name: "media",
          params: "(hover: hover)",
        });
        hoverHover.append(container.nodes);
        container.append(hoverHover);
        hoverHover.walkRules((rule) => {
          rule.selector = `.${e(
            `hover-hover${separator}${rule.selector.slice(1)}`,
          )}`;
        });
      });
      addVariant("hover-none", ({ container, separator }) => {
        const hoverNone = postcss.atRule({
          name: "media",
          params: "(hover: none)",
        });
        hoverNone.append(container.nodes);
        container.append(hoverNone);
        hoverNone.walkRules((rule) => {
          rule.selector = `.${e(
            `hover-none${separator}${rule.selector.slice(1)}`,
          )}`;
        });
      });
    }),
  ],
};
