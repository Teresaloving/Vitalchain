"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

const VITALCHAIN_ADDRESS = process.env.NEXT_PUBLIC_VITALCHAIN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const HONORBAGE_ADDRESS = process.env.NEXT_PUBLIC_HONORBAGE_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const VITALCHAIN_COUNT_ABI = [
  { inputs: [], name: "myEncryptedCount", outputs: [{ internalType: "euint32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" }
];

const HONORBAGE_ABI = [
  { inputs: [{ internalType: "uint256", name: "levelIndex", type: "uint256" }], name: "claimBadge", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "thresholds", outputs: [{ internalType: "uint32[]", name: "", type: "uint32[]" }], stateMutability: "view", type: "function" }
];

const ACHIEVEMENT_LEVELS = [
  { 
    name: "健康先锋", 
    emoji: "🌱", 
    threshold: 1, 
    color: "linear-gradient(45deg, #4ecdc4, #44a08d)",
    description: "开启健康数据记录之旅"
  },
  { 
    name: "活力达人", 
    emoji: "⚡", 
    threshold: 10, 
    color: "linear-gradient(45deg, #667eea, #764ba2)",
    description: "坚持记录，追求健康生活"
  },
  { 
    name: "生命守护者", 
    emoji: "🏆", 
    threshold: 20, 
    color: "linear-gradient(45deg, #f093fb, #f5576c)",
    description: "健康管理的终极成就"
  },
];

export default function AchievementCenter() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [countHandle, setCountHandle] = useState<string | null>(null);
  const [clearCount, setClearCount] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!window.ethereum) return;
    const p = new ethers.BrowserProvider(window.ethereum);
    setProvider(p);
    p.send("eth_chainId", []).then((hex: string) => setChainId(parseInt(hex, 16))).catch(() => {});
    p.send("eth_accounts", []).then(async (accs: string[]) => { 
      if (accs?.length) { 
        const s = await p.getSigner(); 
        setSigner(s); 
        setAccount(await s.getAddress()); 
      } 
    }).catch(() => {});
  }, []);

  const connect = async () => {
    if (!provider) return;
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner(); 
    setSigner(s); 
    setAccount(await s.getAddress());
    const net = await s.provider.getNetwork(); 
    setChainId(Number(net.chainId));
  };

  const decrypt = async () => {
    if (!signer || !chainId) return;
    setIsDecrypting(true);
    try {
      setMsg("🔐 正在读取加密数据句柄...");
      const c = new ethers.Contract(VITALCHAIN_ADDRESS, VITALCHAIN_COUNT_ABI, signer);
      const handle: string = await c.myEncryptedCount();
      setCountHandle(handle);
      setMsg("🧮 正在进行零知识解密...");

      let instance: any;
      if (chainId === 31337) {
        const { MockFhevmInstance } = await import("@fhevm/mock-utils");
        const p = new ethers.JsonRpcProvider("http://localhost:8545");
        let md: any = null; 
        try { md = await p.send("fhevm_relayer_metadata", []);} catch {}
        instance = await (MockFhevmInstance as any).create(p, p, {
          aclContractAddress: md?.ACLAddress ?? "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
          inputVerifierContractAddress: md?.InputVerifierAddress ?? "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
          kmsContractAddress: md?.KMSVerifierAddress ?? "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
          chainId: 31337,
          gatewayChainId: 55815,
          verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
          verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
        });
      } else {
        const win = window as any; 
        if (!win.relayerSDK) { 
          await new Promise<void>((resolve, reject) => { 
            const s = document.createElement("script"); 
            s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs"; 
            s.onload = () => resolve(); 
            s.onerror = () => reject(new Error("SDK load failed")); 
            document.head.appendChild(s); 
          }); 
        }
        await (window as any).relayerSDK.initSDK();
        instance = await (window as any).relayerSDK.createInstance({ ...(window as any).relayerSDK.SepoliaConfig, network: (window as any).ethereum });
      }

      const { publicKey, privateKey } = instance.generateKeypair();
      const start = Math.floor(Date.now()/1000); 
      const days = 365;
      const eip712 = instance.createEIP712(publicKey, [VITALCHAIN_ADDRESS], start, days);
      const signature = await (signer as any).signTypedData(eip712.domain, { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification }, eip712.message);
      const userAddr = await signer.getAddress();
      const res = await instance.userDecrypt([{ handle, contractAddress: VITALCHAIN_ADDRESS }], privateKey, publicKey, signature, [VITALCHAIN_ADDRESS], userAddr, start, days);
      setClearCount(Number(res[handle]));
      setMsg("✅ 解密完成，成就数据已更新！");
    } catch (e: any) { 
      setMsg(`❌ 解密失败: ${e?.message || e}`); 
    } finally {
      setIsDecrypting(false);
    }
  };

  const claim = async (idx: number) => {
    if (!signer) return;
    setClaimingIndex(idx);
    try {
      setMsg(`🎯 正在铸造 ${ACHIEVEMENT_LEVELS[idx].name} 成就徽章...`);
      const c = new ethers.Contract(HONORBAGE_ADDRESS, HONORBAGE_ABI, signer);
      const tx = await c.claimBadge(idx); 
      await tx.wait();
      setMsg(`🎉 恭喜！${ACHIEVEMENT_LEVELS[idx].name} 成就徽章已成功铸造！`);
    } catch (e: any) { 
      setMsg(`❌ 铸造失败: ${e?.message || e}`); 
    } finally {
      setClaimingIndex(null);
    }
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🔬</div>
            <div className="logo-text">VitalChain</div>
          </div>
        </div>
        
        <nav className="nav-menu">
          <Link href="/" className="nav-item">
            📊 仪表板
          </Link>
          <Link href="/submit" className="nav-item">
            ➕ 新建记录
          </Link>
          <Link href="/badges" className="nav-item active">
            🏆 成就徽章
          </Link>
          <div className="nav-item" style={{marginTop: 'auto', borderTop: '1px solid var(--light-gray)', paddingTop: '1rem'}}>
            💡 隐私计算
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="dashboard-header">
          <div>
            <h1 className="page-title">成就徽章中心</h1>
            <p style={{color: '#6c757d', marginTop: '0.5rem'}}>
              根据您的健康记录数量解锁专属成就徽章
            </p>
          </div>
          <div className="wallet-status">
            <div className={`status-badge ${account ? 'status-connected' : 'status-disconnected'}`}>
              {chainId === 31337 ? '🔗 本地网络' : chainId === 11155111 ? '🌐 Sepolia' : '❌ 未连接'}
            </div>
            {account ? (
              <div className="status-badge status-connected">
                {account.slice(0,6)}...{account.slice(-4)}
              </div>
            ) : (
              <button className="btn-gradient btn-primary" onClick={connect}>
                连接钱包
              </button>
            )}
          </div>
        </div>

        {account ? (
          <>
            {/* Decryption Panel */}
            <div className="form-container" style={{marginBottom: '2rem'}}>
              <div style={{textAlign: 'center', marginBottom: '2rem'}}>
                <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🔓</div>
                <h2 style={{color: 'var(--dark-gray)', marginBottom: '0.5rem'}}>解密成就数据</h2>
                <p style={{color: '#6c757d'}}>点击按钮解密您的健康记录次数以查看可获得的成就</p>
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', marginBottom: '1rem'}}>
                <button 
                  className="btn-gradient btn-primary" 
                  onClick={decrypt}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? '🔄 解密中...' : '🔐 解密成就数据'}
                </button>
                
                {clearCount !== null && (
                  <div className="status-badge status-connected">
                    📊 记录次数: {clearCount}
                  </div>
                )}
              </div>

              {countHandle && (
                <div style={{textAlign: 'center', color: '#6c757d', fontSize: '0.875rem'}}>
                  加密句柄: {countHandle.slice(0,12)}...{countHandle.slice(-8)}
                </div>
              )}

              {msg && (
                <div className="message-box">
                  {msg}
                </div>
              )}
            </div>

            {/* Achievement Cards */}
            <div className="metrics-grid">
              {ACHIEVEMENT_LEVELS.map((achievement, i) => {
                const unlocked = (clearCount ?? 0) >= achievement.threshold;
                const progress = clearCount ? Math.min((clearCount / achievement.threshold) * 100, 100) : 0;
                
                return (
                  <div 
                    key={i} 
                    className="metric-card" 
                    style={{
                      opacity: unlocked ? 1 : 0.7,
                      background: unlocked ? achievement.color : 'var(--white)',
                      color: unlocked ? 'white' : 'var(--dark-gray)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Progress Bar */}
                    {!unlocked && (
                      <div 
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          height: '4px',
                          width: `${progress}%`,
                          background: 'var(--accent-green)',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    )}

                    <div className="metric-icon" style={{fontSize: '4rem'}}>
                      {achievement.emoji}
                    </div>
                    
                    <h3 style={{
                      margin: '1rem 0 0.5rem 0', 
                      color: unlocked ? 'white' : 'var(--dark-gray)',
                      fontSize: '1.5rem'
                    }}>
                      {achievement.name}
                    </h3>
                    
                    <p style={{
                      color: unlocked ? 'rgba(255,255,255,0.9)' : '#6c757d',
                      marginBottom: '1rem',
                      fontSize: '0.975rem'
                    }}>
                      {achievement.description}
                    </p>

                    <div style={{
                      color: unlocked ? 'rgba(255,255,255,0.8)' : '#6c757d',
                      fontSize: '0.875rem',
                      marginBottom: '1.5rem'
                    }}>
                      需要 {achievement.threshold} 次记录解锁
                      {!unlocked && clearCount !== null && (
                        <span> • 还需 {Math.max(0, achievement.threshold - clearCount)} 次</span>
                      )}
                    </div>

                    <button 
                      className={`btn-gradient ${unlocked ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => claim(i)}
                      disabled={!unlocked || claimingIndex === i}
                      style={{
                        width: '100%',
                        opacity: unlocked ? 1 : 0.6,
                        cursor: unlocked ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {claimingIndex === i ? '🔄 铸造中...' : 
                       unlocked ? '🎯 领取徽章' : 
                       `🔒 ${Math.max(0, achievement.threshold - (clearCount ?? 0))} 次后解锁`}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="form-container" style={{textAlign: 'center'}}>
            <div style={{fontSize: '4rem', marginBottom: '1rem'}}>🏆</div>
            <h2 style={{marginBottom: '1rem', color: 'var(--dark-gray)'}}>查看成就徽章</h2>
            <p style={{color: '#6c757d', marginBottom: '2rem'}}>
              连接钱包查看您的健康记录成就和可领取的专属徽章
            </p>
            <button className="btn-gradient btn-primary" onClick={connect}>
              连接 MetaMask 钱包
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


