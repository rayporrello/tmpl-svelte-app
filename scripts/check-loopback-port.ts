#!/usr/bin/env bun
/**
 * Verifies that site.project.json's deployment.loopbackPort matches the
 * platform-allocated port in web-data-platform/clients.json.
 *
 * Skipped silently when WEB_DATA_PLATFORM_PATH is unset and no sibling
 * web-data-platform directory exists, so plain dev does not require a
 * platform checkout. When the platform is present, the check fails on
 * any drift so Caddy (driven by clients.json) and the Quadlet (driven
 * by site.project.json) cannot disagree.
 *
 * Run: bun run check:loopback-port
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readProjectManifest, isTemplateProjectManifest } from './lib/site-project';

type ClientsRegistry = {
	clients?: Array<{
		slug?: string;
		loopbackPort?: number;
	}>;
};

type Result = {
	exitCode: number;
	message: string;
};

function defaultPlatformPath(rootDir: string): string {
	const env = process.env.WEB_DATA_PLATFORM_PATH?.trim();
	if (env) return resolve(rootDir, env);
	return resolve(rootDir, '..', 'web-data-platform');
}

export function runCheckLoopbackPort(rootDir = process.cwd()): Result {
	const manifest = readProjectManifest(rootDir);
	if (isTemplateProjectManifest(manifest)) {
		return {
			exitCode: 0,
			message: 'Loopback port check skipped (template manifest — no real slug yet).',
		};
	}

	const platformPath = defaultPlatformPath(rootDir);
	const clientsPath = resolve(platformPath, 'clients.json');
	const platformIsAvailable = existsSync(clientsPath);
	const platformExplicitlyConfigured = process.env.WEB_DATA_PLATFORM_PATH !== undefined;

	if (!platformIsAvailable) {
		if (platformExplicitlyConfigured) {
			return {
				exitCode: 1,
				message:
					`WEB_DATA_PLATFORM_PATH is set but ${clientsPath} does not exist. ` +
					`Either provision the client there or unset WEB_DATA_PLATFORM_PATH.`,
			};
		}
		return {
			exitCode: 0,
			message: `Loopback port check skipped (no platform clients.json at ${clientsPath}).`,
		};
	}

	const registry = JSON.parse(readFileSync(clientsPath, 'utf8')) as ClientsRegistry;
	const slug = manifest.project.projectSlug;
	const entry = registry.clients?.find((client) => client.slug === slug);
	if (!entry) {
		return {
			exitCode: 0,
			message:
				`Loopback port check skipped (no clients.json entry for slug "${slug}"). ` +
				`Run web:launch-site from web-data-platform to provision this client.`,
		};
	}

	const platformPort = entry.loopbackPort;
	if (typeof platformPort !== 'number') {
		return {
			exitCode: 1,
			message: `clients.json entry for "${slug}" is missing loopbackPort.`,
		};
	}

	const localPort = manifest.deployment.loopbackPort;
	if (localPort !== platformPort) {
		return {
			exitCode: 1,
			message:
				`Loopback port drift: site.project.json deployment.loopbackPort=${localPort} ` +
				`but ${clientsPath} clients[slug=${slug}].loopbackPort=${platformPort}. ` +
				`Platform is authoritative. Rerun web:launch-site to resync, then ` +
				`commit the updated site.project.json.`,
		};
	}

	return {
		exitCode: 0,
		message: `Loopback port aligned with platform (slug=${slug}, port=${localPort}).`,
	};
}

export function main(rootDir = process.cwd()): number {
	const result = runCheckLoopbackPort(rootDir);
	if (result.exitCode === 0) {
		console.log(result.message);
	} else {
		console.error(result.message);
	}
	return result.exitCode;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	process.exit(main());
}
