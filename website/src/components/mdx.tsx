import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { RunExample } from './run-example';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    RunExample,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
