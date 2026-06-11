export type OutlineNode =
  | { kind: 'file'; title: string; index: number }
  | { kind: 'dir'; name: string; children: OutlineNode[] }

export function buildOutlineTree(
  entries: { title: string; relativePath: string }[],
  indices: number[],
): OutlineNode[] {
  const root: OutlineNode[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const parts = entry.relativePath.split('/')
    parts.pop()
    const dirParts = parts

    const fileNode: OutlineNode = {
      kind: 'file',
      title: entry.title,
      index: indices[i],
    }

    if (dirParts.length === 0) {
      root.push(fileNode)
    } else {
      ensureDirNode(root, dirParts).children.push(fileNode)
    }
  }

  return root
}

export function ensureDirNode(
  siblings: OutlineNode[],
  dirParts: string[],
): Extract<OutlineNode, { kind: 'dir' }> {
  const dirName = dirParts[0]
  let dirNode = siblings.find(
    (n): n is Extract<OutlineNode, { kind: 'dir' }> =>
      n.kind === 'dir' && n.name === dirName,
  )

  if (!dirNode) {
    dirNode = { kind: 'dir', name: dirName, children: [] }
    siblings.push(dirNode)
  }

  if (dirParts.length === 1) {
    return dirNode
  }
  return ensureDirNode(dirNode.children, dirParts.slice(1))
}

export function countVisible(nodes: OutlineNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.kind === 'dir') {
      count += countVisible(node.children)
    }
  }
  return count
}
