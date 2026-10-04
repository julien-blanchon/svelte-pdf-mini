import api from '#lib/api/generated.json';

export interface ApiProp {
	name: string;
	type: string;
	default?: string;
	description?: string;
	required: boolean;
	bindable: boolean;
}
export interface ApiPart {
	name: string;
	component: string;
	file: string;
	description?: string;
	element?: string;
	props: ApiProp[];
	snippetProps: ApiProp[];
	dataAttributes: string[];
}
export interface ApiNamespace {
	name: string;
	parts: ApiPart[];
}

export interface CssVariable {
	name: string;
	default?: string;
}

export const apiNamespaces = (api as { namespaces: ApiNamespace[] }).namespaces;
export const cssVariables = (api as { cssVariables: CssVariable[] }).cssVariables;

export function getNamespace(name: string): ApiNamespace | undefined {
	return apiNamespaces.find((ns) => ns.name === name);
}

export const slugOf = (component: string) => `api-${component.toLowerCase().replace(/\./g, '-')}`;
