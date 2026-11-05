import { describe, expect, it } from 'bun:test';
import { color } from '../src/color';

describe('Bun.color wrapper', () => {
  it('should wrap text with Bun.color ANSI sequences and reset', () => {
    const cyanStr = color.cyan('Cyan Text');
    const greenStr = color.green('Green Text');
    const redStr = color.red('Red Text');
    const yellowStr = color.yellow('Yellow Text');

    expect(cyanStr).toContain(Bun.color('cyan', 'ansi')!);
    expect(cyanStr).toContain('Cyan Text');
    expect(cyanStr.endsWith('\x1b[0m')).toBe(true);

    expect(greenStr).toContain(Bun.color('green', 'ansi')!);
    expect(greenStr).toContain('Green Text');
    expect(greenStr.endsWith('\x1b[0m')).toBe(true);

    expect(redStr).toContain(Bun.color('red', 'ansi')!);
    expect(redStr).toContain('Red Text');
    expect(redStr.endsWith('\x1b[0m')).toBe(true);

    expect(yellowStr).toContain(Bun.color('yellow', 'ansi')!);
    expect(yellowStr).toContain('Yellow Text');
    expect(yellowStr.endsWith('\x1b[0m')).toBe(true);
  });
});
