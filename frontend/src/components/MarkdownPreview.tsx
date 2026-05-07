import { useMemo } from 'react';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

function renderMarkdown(content: string): string {
  return content
    // Code blocks (must be done first to avoid other replacements inside)
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-base-300 p-3 rounded my-2 overflow-x-auto"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-base-300 px-1 rounded text-sm">$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-4 mb-2">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-6 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-6 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="link link-primary" target="_blank" rel="noopener noreferrer">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded my-2" />')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-4 border-base-300" />')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary pl-4 py-1 my-2 italic text-base-content/80">$1</blockquote>')
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gm, '<div class="flex items-center gap-2 my-1"><input type="checkbox" class="checkbox checkbox-sm" checked disabled /><span>$1</span></div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-2 my-1"><input type="checkbox" class="checkbox checkbox-sm" disabled /><span>$1</span></div>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^\* (.+)$/gm, '<li class="ml-4">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Wrap consecutive li elements in ul/ol
    .replace(/(<li class="ml-4">.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>')
    .replace(/(<li class="ml-4 list-decimal">.*<\/li>\n?)+/g, '<ol class="list-decimal my-2">$&</ol>')
    // Tables (simple support)
    .replace(/^\|(.+)\|$/gm, (_match, content) => {
      const cells = content.split('|').map((cell: string) => cell.trim());
      const isHeader = cells.some((c: string) => c.match(/^-+$/));
      if (isHeader) return '';
      const cellTag = isHeader ? 'th' : 'td';
      return '<tr>' + cells.map((c: string) => `<${cellTag} class="border border-base-300 px-3 py-2">${c}</${cellTag}>`).join('') + '</tr>';
    })
    // Paragraphs (non-empty lines that aren't already wrapped)
    .replace(/^(?!<[htubloda]|<img|<pre|<hr|<div|$)(.+)$/gm, '<p class="my-2">$1</p>')
    // Clean up extra newlines
    .replace(/\n\n+/g, '\n');
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
