import type { ReactNode } from "react"
import RoleRoute from "@/components/RoleRoute"

/** Gate for `/dashboard/*`: only users whose profile role is `lecturer`. */
export default function LecturerRoute({ children }: { children: ReactNode }) {
  return <RoleRoute role="lecturer">{children}</RoleRoute>
}
