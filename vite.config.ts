import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// enhancedImages() MUST come before sveltekit() — it preprocesses <enhanced:img> elements
	plugins: [enhancedImages(), sveltekit()]
});
