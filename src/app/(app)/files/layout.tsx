import { FilesShell } from '@/components/files/FilesShell'
import { nextcloudPublicUrl } from '@/lib/env'

export const metadata = { title: 'Files' }

export default function FilesLayout({ children }: { children: React.ReactNode }) {
  return <FilesShell nextcloudHref={`${nextcloudPublicUrl()}/apps/files`}>{children}</FilesShell>
}
