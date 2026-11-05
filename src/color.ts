const reset = '\x1b[0m';

export const color = {
  cyan: (str: string | number) => `${Bun.color('cyan', 'ansi') ?? ''}${str}${reset}`,
  green: (str: string | number) => `${Bun.color('green', 'ansi') ?? ''}${str}${reset}`,
  red: (str: string | number) => `${Bun.color('red', 'ansi') ?? ''}${str}${reset}`,
  yellow: (str: string | number) => `${Bun.color('yellow', 'ansi') ?? ''}${str}${reset}`,
  custom: (colorName: string, str: string | number) => `${Bun.color(colorName, 'ansi') ?? ''}${str}${reset}`,
};

export default color;
