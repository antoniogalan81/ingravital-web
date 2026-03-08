import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/ingravital.apk",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
          {
            key: "Content-Disposition",
            value: "attachment; filename=\"ingravital.apk\"",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
