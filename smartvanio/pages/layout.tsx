"use client";

import { Avatar } from "@/shared/components/avatar";
import { Dropdown, DropdownButton } from "@/shared/components/dropdown";
import {
  Navbar,
  NavbarItem,
  NavbarSection,
  NavbarSpacer,
} from "@/shared/components/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/shared/components/sidebar";
import { StackedLayout } from "@/shared/components/stacked-layout";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { usePathname } from "next/navigation";
const navItems = [
  { label: "Home", url: "/" },
  { label: "Settings", url: "/settings" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem} className="lg:mb-2.5">
                <Avatar src="/tailwind-logo.svg" />
                <SidebarLabel>Tailwind Labs</SidebarLabel>
                <ChevronDownIcon />
              </DropdownButton>
            </Dropdown>
          </SidebarHeader>
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
