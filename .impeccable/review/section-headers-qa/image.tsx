import React from "react";
export default function Image({ fill, priority, unoptimized, sizes, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) {
  return <img {...props} style={fill ? { ...props.style, position: "absolute", width: "100%", height: "100%" } : props.style} />;
}
