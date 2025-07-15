import * as aws from "@pulumi/aws";

export default function slackBot({
  stack,
  blueprintId = "nodejs",
  bundleId = "nano_2_0",
  userData = "",
}: {
  stack: string;
  blueprintId?: string;
  bundleId?: string;
  userData?: string;
}) {
  const instance = new aws.lightsail.Instance(`slack-bot-instance-${stack}`, {
    availabilityZone: "us-east-1a",
    blueprintId,
    bundleId,
    userData,
    tags: {
      Name: `slack-bot-${stack}`,
    },
  });

  const _portInfo = new aws.lightsail.InstancePublicPorts(
    `slack-bot-port-${stack}`,
    {
      instanceName: instance.name,
      portInfos: [
        {
          fromPort: 3000,
          toPort: 3000,
          protocol: "tcp",
        },
      ],
    },
  );

  const staticIp = new aws.lightsail.StaticIp(`slack-bot-ip-${stack}`);
  const _staticIpAttachment = new aws.lightsail.StaticIpAttachment(
    `slack-bot-ip-attach-${stack}`,
    {
      instanceName: instance.name,
      staticIpName: staticIp.id,
    },
  );

  const publicIp = staticIp.ipAddress;

  return { publicIp };
}
