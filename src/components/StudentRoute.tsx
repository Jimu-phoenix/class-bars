import type { ReactNode } from "react"
import RoleRoute from "@/components/RoleRoute"

/** Gate for `/student/*`: only users whose profile role is `student`. */
export default function StudentRoute({ children }: { children: ReactNode }) {
  return <RoleRoute role="student">{children}</RoleRoute>
}
