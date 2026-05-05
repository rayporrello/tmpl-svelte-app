import { describe, expect, it } from 'vitest';

import { buildSvg, wrapText } from '../../scripts/generate-og';

describe('wrapText', () => {
	it('keeps short text on one line', () => {
		expect(wrapText('Acme Corp', 22, 2)).toEqual(['Acme Corp']);
	});

	it('wraps two-line headlines greedily', () => {
		expect(wrapText('Acme Corporation Marketing Site', 22, 2)).toEqual([
			'Acme Corporation',
			'Marketing Site',
		]);
	});

	it('truncates with ellipsis when text overflows the line budget', () => {
		const result = wrapText('Acme Corporation International Marketing And Operations Site', 22, 2);
		expect(result).toHaveLength(2);
		expect(result[0]).toBe('Acme Corporation');
		expect(result[1].endsWith('…')).toBe(true);
		expect(result[1].length).toBeLessThanOrEqual(22);
	});

	it('handles empty text', () => {
		expect(wrapText('', 22, 2)).toEqual([]);
	});

	it('accepts overflow on a single word longer than the line limit', () => {
		const result = wrapText('Supercalifragilistic', 10, 2);
		expect(result).toEqual(['Supercalifragilistic']);
	});
});

describe('buildSvg', () => {
	it('embeds project values and escapes XML-significant characters', () => {
		const svg = buildSvg({
			bg: '#0B1120',
			siteName: 'Acme & Sons',
			description: 'Marketing for <Acme>',
			domain: 'acme.example',
		});
		expect(svg).toContain('width="1200"');
		expect(svg).toContain('height="630"');
		expect(svg).toContain('#0B1120');
		expect(svg).toContain('Acme &amp; Sons');
		expect(svg).toContain('Marketing for &lt;Acme&gt;');
		expect(svg).toContain('acme.example');
	});

	it('positions the headline higher when it wraps to two lines', () => {
		const oneLine = buildSvg({
			bg: '#000',
			siteName: 'Acme',
			description: 'Short',
			domain: 'acme.example',
		});
		const twoLines = buildSvg({
			bg: '#000',
			siteName: 'Acme Corporation Marketing Group',
			description: 'Short',
			domain: 'acme.example',
		});
		expect(oneLine).toContain('y="300"');
		expect(twoLines).toContain('y="240"');
	});
});
