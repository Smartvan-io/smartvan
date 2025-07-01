"use client";

import {
  Navbar,
  NavbarItem,
  NavbarSection,
  NavbarSpacer,
} from "@/shared/components/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarItem,
  SidebarSection,
} from "@/shared/components/sidebar";
import { StackedLayout } from "@/shared/components/stacked-layout";
import { usePathname } from "next/navigation";
const navItems = [
  { label: "Home", url: "/" },
  { label: "Custom Cards", url: "/custom-cards" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";

  console.log(pathname);

  return (
    <StackedLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection className="max-lg:hidden">
            {navItems.map(({ label, url }) => (
              <NavbarItem key={label} href={url} current={pathname === url}>
                {label}
              </NavbarItem>
            ))}
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarBody>
            <SidebarSection>
              {navItems.map(({ label, url }) => (
                <SidebarItem key={label} href={url}>
                  {label}
                </SidebarItem>
              ))}
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      }
    >
      {children}
    </StackedLayout>
  );
}
