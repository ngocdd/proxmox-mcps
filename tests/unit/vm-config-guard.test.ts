import { describe, expect, it } from "vitest";
import {
  findDisallowedConfigKeys,
  VM_CONFIG_ALLOWED_KEYS,
} from "../../src/tools/vm/config.js";

describe("VM config guard", () => {
  describe("allowed keys", () => {
    it("accepts every key in the allowlist", () => {
      for (const key of VM_CONFIG_ALLOWED_KEYS) {
        const rejected = findDisallowedConfigKeys({ [key]: "anything" });
        expect(rejected, `key ${key} should be allowed`).toEqual([]);
      }
    });

    it("accepts common disk slots", () => {
      for (const key of ["scsi0", "scsi1", "scsi15", "virtio0", "sata0", "ide2"]) {
        const rejected = findDisallowedConfigKeys({ [key]: "local-lvm:32" });
        expect(rejected, `key ${key} should be allowed`).toEqual([]);
      }
    });

    it("accepts common NIC slots", () => {
      for (const key of ["net0", "net1", "net3"]) {
        const rejected = findDisallowedConfigKeys({ [key]: "virtio=00:11:22:33:44:55" });
        expect(rejected, `key ${key} should be allowed`).toEqual([]);
      }
    });

    it("accepts a mix of allowlist + slot keys", () => {
      const rejected = findDisallowedConfigKeys({
        cores: 4,
        memory: 8192,
        scsi0: "local-lvm:32",
        net0: "virtio",
        onboot: true,
        tags: "prod",
      });
      expect(rejected).toEqual([]);
    });
  });

  describe("rejected keys", () => {
    it("rejects args (QEMU extra args)", () => {
      const rejected = findDisallowedConfigKeys({ args: "-fw_cfg ..." });
      expect(rejected).toEqual(["args"]);
    });

    it("rejects machine type override", () => {
      const rejected = findDisallowedConfigKeys({ machine: "q35" });
      expect(rejected).toEqual(["machine"]);
    });

    it("rejects hostpci* (host PCI passthrough)", () => {
      const rejected = findDisallowedConfigKeys({
        hostpci0: "01:00.0,pcie=1",
        hostpci1: "02:00.0",
      });
      expect(rejected).toEqual(["hostpci0", "hostpci1"]);
    });

    it("rejects usb* (host USB passthrough)", () => {
      const rejected = findDisallowedConfigKeys({ usb0: "host=1-1" });
      expect(rejected).toEqual(["usb0"]);
    });

    it("rejects smbios1 (SMBIOS override)", () => {
      const rejected = findDisallowedConfigKeys({ smbios1: "uuid=…" });
      expect(rejected).toEqual(["smbios1"]);
    });

    it("rejects numa* (NUMA topology)", () => {
      const rejected = findDisallowedConfigKeys({ numa0: "..." });
      expect(rejected).toEqual(["numa0"]);
    });

    it("rejects bios", () => {
      const rejected = findDisallowedConfigKeys({ bios: "ovmf" });
      expect(rejected).toEqual(["bios"]);
    });

    it("rejects cpuflags", () => {
      const rejected = findDisallowedConfigKeys({ cpuflags: "+hypervisor" });
      expect(rejected).toEqual(["cpuflags"]);
    });

    it("rejects unknown / typo keys", () => {
      const rejected = findDisallowedConfigKeys({ corez: 4 });
      expect(rejected).toEqual(["corez"]);
    });

    it("rejects mixed allowed + disallowed", () => {
      const rejected = findDisallowedConfigKeys({
        cores: 4,
        args: "-fw_cfg ...",
        memory: 4096,
        hostpci0: "01:00.0",
      });
      expect(rejected.sort()).toEqual(["args", "hostpci0"]);
    });
  });

  describe("empty / edge cases", () => {
    it("accepts empty config", () => {
      expect(findDisallowedConfigKeys({})).toEqual([]);
    });

    it("does not allow net-like slot with weird suffix", () => {
      expect(findDisallowedConfigKeys({ network0: "x" })).toEqual(["network0"]);
      expect(findDisallowedConfigKeys({ net: "x" })).toEqual(["net"]);
    });

    it("does not allow scsi with non-numeric suffix", () => {
      expect(findDisallowedConfigKeys({ scsiA: "x" })).toEqual(["scsiA"]);
    });
  });
});
