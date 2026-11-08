/** Rune Icons 0.1.0 outline assets, Apache-2.0. Source: https://github.com/Runeicons/runeicons
 * License preserved in public/licenses. Build-time extraction avoids shipping unused variants. */
import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement> & { size?: number };
export function LayoutDashboard({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M9 3H4C3.44772 3 3 3.44772 3 4V9C3 9.55228 3.44772 10 4 10H9C9.55228 10 10 9.55228 10 9V4C10 3.44772 9.55228 3 9 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\r\n<path d="M20 3H15C14.4477 3 14 3.44772 14 4V9C14 9.55228 14.4477 10 15 10H20C20.5523 10 21 9.55228 21 9V4C21 3.44772 20.5523 3 20 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\r\n<path d="M20 14H15C14.4477 14 14 14.4477 14 15V20C14 20.5523 14.4477 21 15 21H20C20.5523 21 21 20.5523 21 20V15C21 14.4477 20.5523 14 20 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\r\n<path d="M9 14H4C3.44772 14 3 14.4477 3 15V20C3 20.5523 3.44772 21 4 21H9C9.55228 21 10 20.5523 10 20V15C10 14.4477 9.55228 14 9 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Network({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M15 6C12.6131 6 10.3239 6.94821 8.63604 8.63604C6.94821 10.3239 6 12.6131 6 15M15 6C15 7.65685 16.3431 9 18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6ZM6 15V3M6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Search({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M20.9999 21.0002L16.6599 16.6602M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function FileText({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M14 2H6C5.46957 2 4.96086 2.21072 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8M14 2C14.3166 1.99949 14.6301 2.06161 14.9225 2.18277C15.215 2.30394 15.4806 2.48176 15.704 2.706L19.292 6.294C19.5168 6.51751 19.6952 6.78335 19.8167 7.07616C19.9382 7.36898 20.0005 7.68297 20 8M14 2V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8L20 8M10 9H8M16 13H8M16 17H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function MessagesSquare({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M7 11H17M7 15H13M7 7H15M22 17C22 17.5304 21.7893 18.0391 21.4142 18.4142C21.0391 18.7893 20.5304 19 20 19H6.828C6.29761 19.0001 5.78899 19.2109 5.414 19.586L3.212 21.788C3.1127 21.8873 2.9862 21.9549 2.84849 21.9823C2.71077 22.0097 2.56803 21.9956 2.43831 21.9419C2.30858 21.8881 2.1977 21.7971 2.11969 21.6804C2.04167 21.5637 2.00002 21.4264 2 21.286V5C2 4.46957 2.21071 3.96086 2.58579 3.58579C2.96086 3.21071 3.46957 3 4 3H20C20.5304 3 21.0391 3.21071 21.4142 3.58579C21.7893 3.96086 22 4.46957 22 5V17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function ArrowUpRight({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M17 17V7H7M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function ChevronRight({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Radio({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M12 20H12.01M2 8.82015C4.75011 6.36037 8.31034 5.00049 12 5.00049C15.6897 5.00049 19.2499 6.36037 22 8.82015M5 12.8591C6.86929 11.0268 9.38247 10.0005 12 10.0005C14.6175 10.0005 17.1307 11.0268 19 12.8591M8.5 16.4288C9.43464 15.5127 10.6912 14.9995 12 14.9995C13.3088 14.9995 14.5654 15.5127 15.5 16.4288" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function CircleHelp({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M9.09009 9.00008C9.32519 8.33175 9.78924 7.76819 10.4 7.40921C11.0108 7.05024 11.729 6.91902 12.4273 7.03879C13.1255 7.15857 13.7589 7.52161 14.2152 8.06361C14.6714 8.60561 14.9211 9.2916 14.9201 10.0001C14.9201 12.0001 11.9201 13.0001 11.9201 13.0001M12 17H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function LockKeyhole({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M4 9.80001V4.00001C4 3.46957 4.21071 2.96087 4.58579 2.58579C4.96086 2.21072 5.46957 2.00001 6 2.00001H14M14 2.00001C14.3169 1.99923 14.6308 2.06122 14.9236 2.18239C15.2164 2.30357 15.4823 2.48153 15.706 2.70601L19.294 6.29401C19.5185 6.51768 19.6964 6.78359 19.8176 7.0764C19.9388 7.36921 20.0008 7.68312 20 8.00001M14 2.00001V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8L20 8.00001M20 8.00001V20C20 20.5304 19.7893 21.0391 19.4142 21.4142C19.0391 21.7893 18.5304 22 18 22H15M9 17V15C9 14.4696 8.78929 13.9609 8.41421 13.5858C8.03914 13.2107 7.53043 13 7 13C6.46957 13 5.96086 13.2107 5.58579 13.5858C5.21071 13.9609 5 14.4696 5 15V17M4 17H10C10.5523 17 11 17.4477 11 18V21C11 21.5523 10.5523 22 10 22H4C3.44772 22 3 21.5523 3 21V18C3 17.4477 3.44772 17 4 17Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Check({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Clock3({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Activity({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M22 12H19.52C19.083 11.9991 18.6577 12.1413 18.3091 12.405C17.9606 12.6686 17.708 13.0392 17.59 13.46L15.24 21.82C15.2249 21.8719 15.1933 21.9175 15.15 21.95C15.1067 21.9825 15.0541 22 15 22C14.9459 22 14.8933 21.9825 14.85 21.95C14.8067 21.9175 14.7751 21.8719 14.76 21.82L9.24 2.18C9.22485 2.12807 9.19327 2.08246 9.15 2.05C9.10673 2.01754 9.05409 2 9 2C8.94591 2 8.89327 2.01754 8.85 2.05C8.80673 2.08246 8.77515 2.12807 8.76 2.18L6.41 10.54C6.29246 10.9592 6.04138 11.3285 5.69486 11.592C5.34835 11.8555 4.92532 11.9988 4.49 12H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Server({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M6 6H6.01M6 18H6.01M4 2H20C21.1046 2 22 2.89543 22 4V8C22 9.10457 21.1046 10 20 10H4C2.89543 10 2 9.10457 2 8V4C2 2.89543 2.89543 2 4 2ZM4 14H20C21.1046 14 22 14.8954 22 16V20C22 21.1046 21.1046 22 20 22H4C2.89543 22 2 21.1046 2 20V16C2 14.8954 2.89543 14 4 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Laptop({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M20.054 15.9871H3.94604M18 5C18.5305 5 19.0392 5.21071 19.4142 5.58579C19.7893 5.96086 20 6.46957 20 7V15.526C19.9999 15.8374 20.0725 16.1446 20.212 16.423L21.28 18.55C21.3571 18.703 21.3936 18.8732 21.386 19.0444C21.3784 19.2155 21.327 19.3818 21.2366 19.5274C21.1463 19.6729 21.0201 19.7928 20.8701 19.8756C20.7201 19.9584 20.5513 20.0012 20.38 20H3.62002C3.44871 20.0012 3.27997 19.9584 3.12997 19.8756C2.97997 19.7928 2.85374 19.6729 2.7634 19.5274C2.67305 19.3818 2.62162 19.2155 2.61402 19.0444C2.60643 18.8732 2.64293 18.703 2.72002 18.55L3.78802 16.423C3.92756 16.1446 4.00016 15.8374 4.00002 15.526V7C4.00002 6.46957 4.21073 5.96086 4.58581 5.58579C4.96088 5.21071 5.46959 5 6.00002 5H18Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function X({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Filter({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M2 5H22M6 12H18M9 19H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function AlertTriangle({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M12 9V13M12 17H12.01M21.7301 18.0002L13.7301 4.00022C13.5556 3.69243 13.3027 3.43641 12.997 3.25829C12.6913 3.08017 12.3438 2.98633 11.9901 2.98633C11.6363 2.98633 11.2888 3.08017 10.9831 3.25829C10.6774 3.43641 10.4245 3.69243 10.2501 4.00022L2.25005 18.0002C2.07373 18.3056 1.98128 18.6521 1.98206 19.0047C1.98284 19.3573 2.07683 19.7035 2.2545 20.008C2.43217 20.3126 2.6872 20.5648 2.99375 20.7391C3.30029 20.9133 3.64746 21.0034 4.00005 21.0002H20.0001C20.351 20.9999 20.6956 20.9072 20.9993 20.7315C21.3031 20.5558 21.5553 20.3033 21.7306 19.9993C21.9059 19.6954 21.9981 19.3506 21.998 18.9997C21.9979 18.6488 21.9055 18.3041 21.7301 18.0002Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function ArrowRight({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M5 12H19M12 19L19 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function GitBranch({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M15 6C12.6131 6 10.3239 6.94821 8.63604 8.63604C6.94821 10.3239 6 12.6131 6 15M15 6C15 7.65685 16.3431 9 18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6ZM6 15V3M6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function CheckCircle2({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M9 12L11 14L15 10M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Shield({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M20 13C20 18 16.5 20.5 12.34 21.95C12.1222 22.0238 11.8855 22.0202 11.67 21.94C7.5 20.5 4 18 4 13V5.99996C4 5.73474 4.10536 5.48039 4.29289 5.29285C4.48043 5.10532 4.73478 4.99996 5 4.99996C7 4.99996 9.5 3.79996 11.24 2.27996C11.4519 2.09896 11.7214 1.99951 12 1.99951C12.2786 1.99951 12.5481 2.09896 12.76 2.27996C14.51 3.80996 17 4.99996 19 4.99996C19.2652 4.99996 19.5196 5.10532 19.7071 5.29285C19.8946 5.48039 20 5.73474 20 5.99996V13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
export function Database({ size = 18, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{
        __html:
          '<g fill="none"><path d="M6 6H6.01M6 18H6.01M4 2H20C21.1046 2 22 2.89543 22 4V8C22 9.10457 21.1046 10 20 10H4C2.89543 10 2 9.10457 2 8V4C2 2.89543 2.89543 2 4 2ZM4 14H20C21.1046 14 22 14.8954 22 16V20C22 21.1046 21.1046 22 20 22H4C2.89543 22 2 21.1046 2 20V16C2 14.8954 2.89543 14 4 14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
      }}
    />
  );
}
